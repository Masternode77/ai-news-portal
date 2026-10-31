/**
 * R8 cutover check: request every preserved URL (docs/diagnosis/05-preserve-list.csv)
 * on a running site and compare the answer with src/lib/url-plan.ts.
 *
 *   node apps/site/tools/verify-urls.ts --base http://localhost:4321 [--content legacy|none] [--markdown] [--json]
 *
 * --content legacy (default) expects the 12 public legacy pages to be published
 * (the legacy JSON mapper, as after the M5 migration); none expects no content
 * pages (an empty preview). Exit 0 when every URL matches, 1 otherwise, 2 on usage
 * errors. Requests use redirect: "manual" so a 301 is seen as a 301.
 */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { loadRedirectsConfig, mapLegacyCollections } from "@cc/shared";
import { describe, expectedFor, locationPath, matches } from "../src/lib/url-plan.ts";
import type { Expected } from "../src/lib/url-plan.ts";

const ROOT = resolve(import.meta.dirname, "../../..");

export interface PreservedUrl {
  url: string;
  type: string;
}

export function parsePreserveList(csv: string): PreservedUrl[] {
  const [header, ...lines] = csv.trim().split(/\r?\n/);
  if (!header?.startsWith("url,type,")) throw new Error("preserve list must start with url,type,…");
  return lines.filter((l) => l.trim().length > 0).map((line) => {
    const [url = "", type = ""] = line.split(",");
    return { url, type };
  });
}

export async function legacyPublishedSlugs(dataDir: string): Promise<Set<string>> {
  const [news, columns] = await Promise.all([
    readFile(resolve(dataDir, "latest-news.json"), "utf8").then((t) => JSON.parse(t) as unknown),
    readFile(resolve(dataDir, "authored-columns.json"), "utf8").then((t) => JSON.parse(t) as unknown),
  ]);
  return new Set(mapLegacyCollections(news, columns).rows.map((row) => row.slug));
}

export interface CheckResult {
  url: string;
  type: string;
  expected: Expected;
  status: number | null;
  location: string | null;
  ok: boolean;
  error?: string;
}

async function check(base: string, item: PreservedUrl, expected: Expected, fetchImpl: typeof fetch): Promise<CheckResult> {
  try {
    const response = await fetchImpl(new URL(item.url, base), { redirect: "manual", headers: { "user-agent": "cc-verify-urls/1" } });
    const location = locationPath(response.headers.get("location"), base);
    return { ...item, expected, status: response.status, location, ok: matches(expected, response.status, location) };
  } catch (error) {
    return { ...item, expected, status: null, location: null, ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function verify(options: { base: string; content: "legacy" | "none"; fetchImpl?: typeof fetch; concurrency?: number }): Promise<CheckResult[]> {
  const urls = parsePreserveList(await readFile(resolve(ROOT, "docs/diagnosis/05-preserve-list.csv"), "utf8"));
  const redirects = await loadRedirectsConfig(resolve(ROOT, "config/redirects.yaml"));
  const publishedSlugs = options.content === "legacy" ? await legacyPublishedSlugs(resolve(ROOT, "src/data")) : new Set<string>();
  const fetchImpl = options.fetchImpl ?? fetch;
  const results: CheckResult[] = new Array(urls.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < urls.length) {
      const index = next++;
      const item = urls[index]!;
      results[index] = await check(options.base, item, expectedFor(item.url, { redirects, publishedSlugs }), fetchImpl);
    }
  };
  await Promise.all(Array.from({ length: options.concurrency ?? 8 }, worker));
  return results;
}

export function markdownReport(base: string, results: readonly CheckResult[]): string {
  const ok = results.filter((r) => r.ok).length;
  const byStatus = new Map<string, number>();
  for (const r of results) byStatus.set(String(r.status), (byStatus.get(String(r.status)) ?? 0) + 1);
  const lines = [
    `### URL parity — ${base}`,
    "",
    `**${ok}/${results.length} match** · answers: ${[...byStatus].map(([s, n]) => `${s} × ${n}`).join(", ")}`,
    "",
  ];
  const failures = results.filter((r) => !r.ok);
  if (failures.length > 0) {
    lines.push("| url | type | expected | actual |", "|---|---|---|---|");
    for (const r of failures) lines.push(`| \`${r.url}\` | ${r.type} | ${describe(r.expected)} | ${r.error ?? `${r.status}${r.location ? ` → ${r.location}` : ""}`} |`);
  }
  return `${lines.join("\n")}\n`;
}

async function main(): Promise<number> {
  const { values } = parseArgs({
    options: { base: { type: "string" }, content: { type: "string", default: "legacy" }, markdown: { type: "boolean", default: false }, json: { type: "boolean", default: false } },
  });
  if (!values.base || (values.content !== "legacy" && values.content !== "none")) {
    console.error("usage: verify-urls.ts --base <url> [--content legacy|none] [--markdown] [--json]");
    return 2;
  }
  const results = await verify({ base: values.base, content: values.content });
  if (values.json) console.log(JSON.stringify(results, null, 2));
  else if (values.markdown) process.stdout.write(markdownReport(values.base, results));
  else for (const r of results) console.log(`${r.ok ? "ok  " : "FAIL"} ${String(r.status).padEnd(4)} ${r.url}${r.ok ? "" : `  (expected ${describe(r.expected)}${r.location ? `, got → ${r.location}` : ""})`}`);
  const failed = results.filter((r) => !r.ok).length;
  console.error(`${results.length - failed}/${results.length} preserved URLs match`);
  return failed === 0 ? 0 : 1;
}

if (import.meta.main) process.exitCode = await main();
