import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ConfigError, loadQaConfig, parseQaConfig, qaRuleEntry } from "../src/index.ts";

const base = (rules: string) => `version: "2026-10-25.1"\nrules:\n${rules}\n`;

test("config/qa.yaml (Phase 3g) loads strictly: ordered rules, hard before soft, auto_pass only on soft entries, image-stage entry, params; duplicates, hard+auto_pass, bad codes, bad stages and unknown keys are rejected", async () => {
  const path = resolve(import.meta.dirname, "../../../config/qa.yaml");
  const qa = await loadQaConfig(path);
  assert.match(qa.version, /^\d{4}-\d{2}-\d{2}\.\d+$/);
  const codes = qa.rules.map((r) => r.rule);
  assert.deepEqual(codes.slice(0, 8), ["SCHEMA_INVALID", "SOURCE_UNREACHABLE", "QUOTE_TOO_LONG", "SIMILARITY_TOO_HIGH", "UNGROUNDED_NUMBER", "UNGROUNDED_ENTITY", "LANG_MISMATCH", "BANNED_PATTERN"], "ADR-004 hard rules first, in the order the stage runs them");
  assert.ok(qa.rules.slice(0, 8).every((r) => r.severity === "hard" && r.auto_pass === undefined && r.enabled && r.stage === "qa"));
  assert.ok(qa.rules.slice(8).every((r) => r.severity === "soft" && r.auto_pass === true), "soft rules start with auto_pass for the Phase 4 shadow");
  assert.equal(new Set(codes).size, codes.length);
  assert.equal(qaRuleEntry(qa, "IMAGE_MISSING")?.stage, "image");
  assert.equal(qaRuleEntry(qa, "IMAGE_MISSING")?.severity, "soft");
  assert.equal(qaRuleEntry(qa, "QUOTE_TOO_LONG")?.params["max_quote_words"], 20);
  assert.equal(qaRuleEntry(qa, "SOURCE_UNREACHABLE")?.params["min_source_chars"], 500);
  assert.equal(qaRuleEntry(qa, "NOPE"), undefined);

  const text = readFileSync(path, "utf8");
  assert.throws(() => parseQaConfig(text.replace("- rule: LANG_MISMATCH", "- rule: SCHEMA_INVALID"), path), (e: unknown) => e instanceof ConfigError && /duplicate rule: SCHEMA_INVALID/.test(e.message));
  assert.throws(() => parseQaConfig(`${text}\nextra_key: 1\n`, path), (e: unknown) => e instanceof ConfigError && /extra_key/.test(e.message));
  assert.throws(() => parseQaConfig(base("  - { rule: SCHEMA_INVALID, severity: hard, auto_pass: true }"), "qa.yaml"), (e: unknown) => e instanceof ConfigError && /auto_pass applies to soft rules only/.test(e.message));
  assert.throws(() => parseQaConfig(base("  - { rule: schema_invalid, severity: hard }"), "qa.yaml"), ConfigError, "codes are UPPER_SNAKE (= the file name under qa/rules/)");
  assert.throws(() => parseQaConfig(base("  - { rule: SCHEMA_INVALID, severity: medium }"), "qa.yaml"), ConfigError);
  assert.throws(() => parseQaConfig(base("  - { rule: SCHEMA_INVALID, severity: hard, stage: publish }"), "qa.yaml"), ConfigError);
  assert.throws(() => parseQaConfig(base("  - { rule: SCHEMA_INVALID, severity: hard, threshold: 1 }"), "qa.yaml"), (e: unknown) => e instanceof ConfigError && /threshold/.test(e.message), "thresholds live under params, unknown keys fail");
  assert.throws(() => parseQaConfig('version: "2026-10-25.1"\nrules: []\n', "qa.yaml"), ConfigError, "at least one rule");
  assert.throws(() => parseQaConfig(base("  - { rule: SCHEMA_INVALID, severity: hard }").replace('version: "2026-10-25.1"\n', ""), "qa.yaml"), ConfigError, "version is required");

  const minimal = parseQaConfig(base("  - { rule: READABILITY_LOW, severity: soft, auto_pass: true, params: { max_avg_sentence_words: 30 } }\n  - { rule: SCHEMA_INVALID, severity: hard, enabled: false }"), "qa.yaml");
  assert.equal(minimal.rules[0]!.enabled, true);
  assert.equal(minimal.rules[0]!.stage, "qa");
  assert.equal(minimal.rules[0]!.params["max_avg_sentence_words"], 30);
  assert.equal(minimal.rules[1]!.enabled, false);
  assert.deepEqual(minimal.rules[1]!.params, {});
});
