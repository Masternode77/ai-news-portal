#!/usr/bin/env node
/**
 * One-off migration of the legacy registry (config/sourceRegistry.yml, 82
 * rows) into config/sources.yaml (contracts.md §4, zod strict).
 *
 * The legacy file is not valid strict YAML (line 254 carries an unquoted
 * `rights_note: a: b` value), so this reads it line by line: a row starts at
 * `  - id:` and every following `    key: value` line belongs to it. Nothing
 * from scripts/ or src/ is imported (P9); the mapping rules in
 * `convertLegacyRow` are the whole contract:
 *
 *   priority P0/P1/P2            -> tier 1/2/3
 *   status active_feed|blocked   -> enabled true|false
 *   allow_text_use true|false    -> text_rights full|rewrite_only (provisional; link_only waits for the ban list)
 *   feed_format epoch_html_index -> type html + extract.kind epoch_index
 *   article_path (Google docs)   -> extract.kind google_release_notes (+ section for the all-GCP feed)
 *   text_scope abstract          -> text_scope abstract + extract.kind arxiv_abstract
 *   domain ec.europa.eu          -> extract.kind ec_press
 *   article_hosts/license_marker -> extract.hosts / extract.license_marker (text-use rows only)
 *
 *   node packages/pipeline/tools/migrate-legacy-registry.ts [--in config/sourceRegistry.yml] [--out config/sources.yaml] [--stdout]
 */
import { readFile, writeFile } from "node:fs/promises";
import { realpathSync } from "node:fs";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import { parseSourcesConfig } from "@cc/shared";
import type { ExtractConfig, SourceConfig } from "@cc/shared";

export interface LegacyRow {
  id: string;
  line: number;
  fields: Record<string, string>;
}

const ROW_START = /^  - id:\s*(.+?)\s*$/;
const ROW_FIELD = /^    ([a-z_]+):\s*(.*?)\s*$/;

/** Line-based reader for the legacy registry; comments and blank lines are ignored. */
export function readLegacyRegistry(text: string): LegacyRow[] {
  const rows: LegacyRow[] = [];
  let current: LegacyRow | null = null;
  for (const [index, line] of text.split("\n").entries()) {
    const start = line.match(ROW_START);
    if (start) {
      current = { id: start[1]!, line: index + 1, fields: {} };
      rows.push(current);
      continue;
    }
    if (!current || line.trim().startsWith("#")) continue;
    const field = line.match(ROW_FIELD);
    if (field) current.fields[field[1]!] = field[2]!;
  }
  return rows;
}

const TIER_BY_PRIORITY: Record<string, 1 | 2 | 3> = { P0: 1, P1: 2, P2: 3 };
const GOOGLE_DOCS_HOST = "docs.cloud.google.com";
/** The all-products feed lists one page per date; only this product section is ours (legacy scopeGoogleAiReleaseItem). */
const GOOGLE_SECTION_BY_FEED: Record<string, string> = {
  "https://docs.cloud.google.com/feeds/gcp-release-notes.xml": "Gemini Enterprise Agent Platform",
};

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

/** Legacy rows mix `2026-10-04` and `2026-08-12T00:00:00.000Z`; the schema wants the date part. */
function reviewedDate(value: string | undefined): string | null {
  const match = value?.match(/^(\d{4}-\d{2}-\d{2})(?:T|$)/);
  return match ? match[1]! : null;
}

function splitHosts(value: string | undefined): string[] | undefined {
  if (!value) return undefined;
  const hosts = [...new Set(value.split(",").map((h) => h.trim().toLowerCase()).filter(Boolean))];
  return hosts.length > 0 ? hosts : undefined;
}

export function convertLegacyRow(row: LegacyRow): SourceConfig {
  const f = row.fields;
  const tier = TIER_BY_PRIORITY[f["priority"] ?? ""];
  if (!tier) throw new Error(`${row.id} (line ${row.line}): unknown priority "${f["priority"]}"`);
  if (!f["feed"]) throw new Error(`${row.id} (line ${row.line}): missing feed`);
  if (!f["name"]) throw new Error(`${row.id} (line ${row.line}): missing name`);
  const textRights = f["allow_text_use"] === "true" ? "full" : "rewrite_only";
  const type = f["feed_format"] === "epoch_html_index" ? "html" : "rss";
  const hosts = splitHosts(f["article_hosts"]);

  let extract: ExtractConfig | undefined;
  if (type === "html") {
    extract = { kind: "epoch_index", ...(f["article_path_prefix"] ? { path_prefix: f["article_path_prefix"] } : {}), ...(hosts ? { hosts } : {}) };
  } else if (f["article_path"] && hostOf(f["feed"]) === GOOGLE_DOCS_HOST) {
    const section = GOOGLE_SECTION_BY_FEED[f["feed"]];
    extract = { kind: "google_release_notes", path: f["article_path"], ...(hosts ? { hosts } : {}), ...(section ? { section } : {}) };
  } else if (f["text_scope"] === "abstract") {
    extract = { kind: "arxiv_abstract", ...(hosts ? { hosts } : {}) };
  } else if (textRights === "full" && f["domain"] === "ec.europa.eu") {
    extract = { kind: "ec_press", ...(hosts ? { hosts } : {}) };
  } else if (textRights === "full" && (hosts || f["license_marker"])) {
    extract = { kind: "generic", ...(hosts ? { hosts } : {}), ...(f["license_marker"] ? { license_marker: f["license_marker"] } : {}) };
  }

  const source: SourceConfig = {
    id: row.id,
    name: f["name"],
    type,
    // The safe fetcher only speaks https; an http feed would fail every run as UNSAFE_URL.
    url: f["feed"].replace(/^http:\/\//i, "https://"),
    tier,
    enabled: f["status"] === "active_feed",
    text_rights: textRights,
    ...(f["terms_url"] && /^https?:\/\//.test(f["terms_url"]) ? { terms_url: f["terms_url"] } : {}),
    ...(reviewedDate(f["reviewed_at"]) ? { reviewed_at: reviewedDate(f["reviewed_at"])! } : {}),
    ...(f["pool_max_age_days"] ? { pool_max_age_days: Number(f["pool_max_age_days"]) } : {}),
    ...(f["language"] && /^[a-z]{2}$/.test(f["language"]) ? { language: f["language"] } : {}),
    ...(f["text_scope"] === "abstract" ? { text_scope: "abstract" as const } : {}),
    ...(extract ? { extract } : {}),
  };
  return source;
}

/** Plain scalar when YAML reads it back unchanged; JSON (double-quoted) otherwise. */
function scalar(value: string): string {
  if (/^https?:\/\/[^\s"'#]+$/.test(value)) return value;
  if (/^[A-Za-z][A-Za-z0-9 ._&()/-]*$/.test(value) && !/^(true|false|null|yes|no|on|off)$/i.test(value) && !/\s$/.test(value)) return value;
  return JSON.stringify(value);
}

const HEADER = (generatedAt: string, count: number) => `# Compute Current rebuild — source registry (contracts.md §4, ADR-004 text_rights)
# Generated by packages/pipeline/tools/migrate-legacy-registry.ts from config/sourceRegistry.yml (${count} rows) on ${generatedAt}.
# Mapping: priority P0/P1/P2 -> tier 1/2/3; status blocked -> enabled: false; allow_text_use true -> full,
# false -> rewrite_only (provisional: the re-narration ban list turns rows into link_only); feed_format
# epoch_html_index -> type: html; article_hosts / article_path(_prefix) / license_marker / text_scope -> extract.
# text_rights mirrors the legacy allow_text_use flag only and is not a legal determination.
# One simple source is at most ten lines (R5); \`extract\` only appears where a page needs a special rule.
# A source the pipeline auto-disabled (sources.health.auto_disabled_at) comes back when reviewed_at here is
# later than that day. Edit by hand from here on; the tool is kept for traceability, not for regeneration.
`;

export function toSourcesYaml(sources: SourceConfig[], generatedAt: string): string {
  const blocks = sources.map((s) => {
    const lines = [
      `- id: ${s.id}`,
      `  name: ${scalar(s.name)}`,
      `  type: ${s.type}`,
      `  url: ${scalar(s.url)}`,
      `  tier: ${s.tier}`,
      `  enabled: ${s.enabled}`,
      `  text_rights: ${s.text_rights}`,
    ];
    if (s.terms_url) lines.push(`  terms_url: ${scalar(s.terms_url)}`);
    if (s.reviewed_at) lines.push(`  reviewed_at: ${s.reviewed_at}`);
    if (s.pool_max_age_days) lines.push(`  pool_max_age_days: ${s.pool_max_age_days}`);
    if (s.language) lines.push(`  language: ${s.language}`);
    if (s.text_scope) lines.push(`  text_scope: ${s.text_scope}`);
    if (s.extract) {
      lines.push("  extract:");
      lines.push(`    kind: ${s.extract.kind}`);
      if (s.extract.path) lines.push(`    path: ${scalar(s.extract.path)}`);
      if (s.extract.path_prefix) lines.push(`    path_prefix: ${scalar(s.extract.path_prefix)}`);
      if (s.extract.hosts) lines.push(`    hosts: [${s.extract.hosts.map(scalar).join(", ")}]`);
      if (s.extract.license_marker) lines.push(`    license_marker: ${scalar(s.extract.license_marker)}`);
      if (s.extract.section) lines.push(`    section: ${scalar(s.extract.section)}`);
    }
    return lines.join("\n");
  });
  return `${HEADER(generatedAt, sources.length)}\n${blocks.join("\n\n")}\n`;
}

export function convertLegacyRegistry(text: string, generatedAt: string): { sources: SourceConfig[]; yaml: string } {
  const rows = readLegacyRegistry(text);
  const sources = rows.map(convertLegacyRow);
  const yaml = toSourcesYaml(sources, generatedAt);
  // Round-trip through the strict loader so the committed file is known-good.
  const parsed = parseSourcesConfig(yaml, "config/sources.yaml");
  if (parsed.length !== sources.length) throw new Error(`round-trip mismatch: ${parsed.length} parsed vs ${sources.length} converted`);
  return { sources: parsed, yaml };
}

async function main(argv: string[]): Promise<number> {
  const { values } = parseArgs({
    args: argv,
    options: {
      in: { type: "string", default: "config/sourceRegistry.yml" },
      out: { type: "string", default: "config/sources.yaml" },
      stdout: { type: "boolean", default: false },
      date: { type: "string", default: new Date().toISOString().slice(0, 10) },
    },
  });
  const text = await readFile(values.in, "utf8");
  const { sources, yaml } = convertLegacyRegistry(text, values.date);
  if (values.stdout) {
    process.stdout.write(yaml);
  } else {
    await writeFile(values.out, yaml, "utf8");
  }
  const tally = (key: (s: SourceConfig) => string) => {
    const counts: Record<string, number> = {};
    for (const s of sources) counts[key(s)] = (counts[key(s)] ?? 0) + 1;
    return counts;
  };
  process.stderr.write(
    `${JSON.stringify({ rows: sources.length, out: values.stdout ? "stdout" : values.out, tier: tally((s) => String(s.tier)), text_rights: tally((s) => s.text_rights), enabled: tally((s) => String(s.enabled)), type: tally((s) => s.type), extract: tally((s) => s.extract?.kind ?? "-") })}\n`,
  );
  return 0;
}

function isMainModule(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return pathToFileURL(realpathSync(entry)).href === import.meta.url;
  } catch {
    return false;
  }
}

if (isMainModule()) {
  main(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (error) => {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      process.exitCode = 2;
    },
  );
}
