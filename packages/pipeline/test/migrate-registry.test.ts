import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseSourcesConfig } from "@cc/shared";
import { convertLegacyRegistry, readLegacyRegistry } from "../tools/migrate-legacy-registry.ts";
import { REPO_ROOT } from "./helpers.ts";

const LEGACY = resolve(REPO_ROOT, "config/sourceRegistry.yml");

function tally<T>(items: T[], key: (item: T) => string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) counts[key(item)] = (counts[key(item)] ?? 0) + 1;
  return counts;
}

test("the line-based reader survives the non-strict legacy YAML", async () => {
  const rows = readLegacyRegistry(await readFile(LEGACY, "utf8"));
  assert.equal(rows.length, 82);
  const techcrunch = rows.find((r) => r.id === "techcrunch-ai")!;
  assert.ok(techcrunch.fields["rights_note"]?.startsWith("link-only permitted explicitly: show feed content"), "the value with the nested colon (line 254) is read whole");
  assert.equal(techcrunch.fields["priority"], "P2");
});

test("82 legacy rows convert into a strict, round-trippable sources.yaml", async () => {
  const { sources, yaml } = convertLegacyRegistry(await readFile(LEGACY, "utf8"), "2026-10-18");
  assert.equal(sources.length, 82);
  assert.equal(parseSourcesConfig(yaml).length, 82);
  assert.deepEqual(tally(sources, (s) => String(s.tier)), { "1": 11, "2": 37, "3": 34 });
  assert.deepEqual(tally(sources, (s) => s.text_rights), { full: 29, rewrite_only: 53 });
  assert.deepEqual(sources.filter((s) => !s.enabled).map((s) => s.id).sort(), ["electimes", "ferc-news"]);
  assert.deepEqual(sources.filter((s) => s.type === "html").map((s) => s.id).sort(), ["epoch-ai-data-insights", "epoch-ai-gradient-updates"]);

  const byId = new Map(sources.map((s) => [s.id, s]));
  assert.deepEqual(byId.get("google-cloud-ai-releases")?.extract, { kind: "google_release_notes", path: "/gemini-enterprise-agent-platform/release-notes", hosts: ["docs.cloud.google.com"], section: "Gemini Enterprise Agent Platform" });
  assert.equal(byId.get("google-cloud-compute-releases")?.extract?.section, undefined);
  const epoch = byId.get("epoch-ai-gradient-updates")!;
  assert.equal(epoch.type, "html");
  assert.equal(epoch.pool_max_age_days, 21);
  assert.deepEqual(epoch.extract, { kind: "epoch_index", path_prefix: "/gradient-updates/", hosts: ["epoch.ai"] });
  const arxiv = byId.get("arxiv-cs-dc")!;
  assert.equal(arxiv.text_scope, "abstract");
  assert.equal(arxiv.extract?.kind, "arxiv_abstract");
  assert.ok(arxiv.extract?.hosts?.includes("arxiv.org"));
  assert.equal(byId.get("ec-press-corner")?.extract?.kind, "ec_press");
  assert.equal(byId.get("kubernetes-blog")?.extract?.license_marker, "Distributed under CC BY 4.0");
  assert.deepEqual(byId.get("eia-today-in-energy")?.extract, { kind: "generic", hosts: ["eia.gov", "www.eia.gov"] });
  const etnews = byId.get("etnews")!;
  assert.equal(etnews.language, "ko");
  assert.equal(etnews.text_rights, "rewrite_only");
  assert.equal(etnews.extract, undefined);
  assert.equal(byId.get("nvidia-blog")?.extract, undefined);
  assert.equal(byId.get("ferc-news")?.enabled, false);

  // R5: a source without special rules fits in ten lines.
  const blocks = yaml.split("\n\n").filter((b) => b.startsWith("- id:"));
  assert.equal(blocks.length, 82);
  for (const block of blocks) {
    if (!block.includes("\n  extract:")) assert.ok(block.trim().split("\n").length <= 10, block);
  }
});
