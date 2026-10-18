#!/usr/bin/env node
/**
 * Renders a `pipeline run --json` result as Markdown for the GitHub Actions
 * step summary (rebuild-ingest-dry-run.yml): funnel, per-source table,
 * extraction totals and dead letters by taxonomy code.
 *
 *   node packages/pipeline/tools/ingest-dry-run-summary.ts <result.json>
 */
import { readFile } from "node:fs/promises";
import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { errorCode } from "../src/runner.ts";

interface SourceStat {
  source_id: string;
  tier: number;
  status: string;
  listed: number;
  kept: number;
  skipped: Record<string, number>;
  ms: number;
  error: string | null;
  fail_streak: number;
  sample: { title: string; url: string; published_at: string | null }[];
  fetch?: { url: string; bytes: number; redirects: number; ms: number };
}

interface Result {
  runId: string;
  status: string;
  live?: boolean;
  funnel: Record<string, unknown>;
  stages: { stage: string; status: string; counts: Record<string, number>; reason?: string; durationMs: number }[];
  sourceStats?: {
    configured: number;
    ok: number;
    failed: number;
    auto_disabled: number;
    items_new: number;
    duplicates: number;
    skipped_items: number;
    extract_ok: number;
    extract_failed: number;
    extract_skipped: number;
    sources: SourceStat[];
  };
  ledger?: { deadLetters: { ref_id: string; error: string }[] };
}

/** Feed titles and error strings are untrusted: neutralise table pipes, newlines and Markdown/HTML syntax. */
export function cell(value: unknown): string {
  return String(value ?? "")
    .replace(/\r?\n/g, " ")
    .replace(/[\\|*_`[\]<>#]/g, (ch) => `\\${ch}`);
}

/** An autolink `<url>` survives parentheses in the URL; angle brackets and whitespace cannot appear inside it. */
export function link(url: string): string {
  const safe = url.replace(/[<>\s]/g, "");
  return /^https?:\/\//.test(safe) ? `<${safe}>` : cell(url);
}

function skippedText(skipped: Record<string, number>): string {
  const parts = Object.entries(skipped)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k} ${v}`);
  return parts.join(", ");
}

export function summarize(result: Result): string {
  const lines: string[] = [];
  const stats = result.sourceStats;
  lines.push(`## Ingest dry-run — \`${result.status}\`${result.live ? " (live feeds)" : " (fixtures)"}`);
  lines.push("");
  lines.push(`run \`${result.runId}\` · started ${cell(result.funnel["started_at"])}`);
  lines.push("");
  lines.push("| funnel | value |");
  lines.push("|---|---|");
  for (const [key, value] of Object.entries(result.funnel)) {
    if (key === "run_id" || key === "started_at") continue;
    lines.push(`| ${key} | ${cell(value)} |`);
  }
  if (stats) {
    lines.push("");
    lines.push(
      `sources: configured ${stats.configured} · ok ${stats.ok} · failed ${stats.failed} · auto-disabled ${stats.auto_disabled} · items new ${stats.items_new} · duplicates ${stats.duplicates} · skipped entries ${stats.skipped_items} · extraction ok ${stats.extract_ok} / failed ${stats.extract_failed} / skipped ${stats.extract_skipped}`,
    );
    lines.push("");
    lines.push("| source | tier | status | listed | kept | skipped | KB | redirects | ms | error |");
    lines.push("|---|---|---|---|---|---|---|---|---|---|");
    const sorted = [...stats.sources].sort((a, b) => a.tier - b.tier || a.source_id.localeCompare(b.source_id));
    for (const s of sorted) {
      const kb = s.fetch ? (s.fetch.bytes / 1024).toFixed(0) : "";
      const redirects = s.fetch ? String(s.fetch.redirects) : "";
      lines.push(`| ${cell(s.source_id)} | ${s.tier} | ${s.status} | ${s.listed} | ${s.kept} | ${cell(skippedText(s.skipped))} | ${kb} | ${redirects} | ${s.ms} | ${cell(s.error ?? "")} |`);
    }
    const redirected = sorted.filter((s) => (s.fetch?.redirects ?? 0) > 0);
    if (redirected.length > 0) {
      lines.push("");
      lines.push("Feeds that redirected (update `url` in config/sources.yaml):");
      lines.push("");
      for (const s of redirected) lines.push(`- ${cell(s.source_id)} → ${link(s.fetch!.url)} (${s.fetch!.redirects} hop${s.fetch!.redirects === 1 ? "" : "s"})`);
    }
    const samples = stats.sources.filter((s) => s.sample.length > 0).slice(0, 12);
    if (samples.length > 0) {
      lines.push("");
      lines.push("<details><summary>Sample items (newest per source, first 12 sources)</summary>");
      lines.push("");
      for (const s of samples) {
        for (const item of s.sample.slice(0, 2)) lines.push(`- **${cell(s.source_id)}** ${cell(item.published_at ?? "")} — ${cell(item.title)} ${link(item.url)}`);
      }
      lines.push("");
      lines.push("</details>");
    }
  }
  const deadLetters = result.ledger?.deadLetters ?? [];
  if (deadLetters.length > 0) {
    const tally = new Map<string, number>();
    for (const d of deadLetters) tally.set(errorCode(d.error), (tally.get(errorCode(d.error)) ?? 0) + 1);
    lines.push("");
    lines.push(`dead letters: ${deadLetters.length}`);
    lines.push("");
    lines.push("| code | count |");
    lines.push("|---|---|");
    for (const [code, count] of [...tally.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)) lines.push(`| ${code} | ${count} |`);
  }
  lines.push("");
  lines.push("| stage | status | duration ms |");
  lines.push("|---|---|---|");
  for (const stage of result.stages) lines.push(`| ${stage.stage} | ${stage.status}${stage.reason ? ` (${stage.reason})` : ""} | ${stage.durationMs} |`);
  return `${lines.join("\n")}\n`;
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
  const path = process.argv[2];
  if (!path) {
    process.stderr.write("usage: ingest-dry-run-summary.ts <result.json>\n");
    process.exitCode = 2;
  } else {
    readFile(path, "utf8")
      .then((text) => process.stdout.write(summarize(JSON.parse(text) as Result)))
      .catch((error: unknown) => {
        process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
        process.exitCode = 2;
      });
  }
}
