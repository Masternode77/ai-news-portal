import { test } from "node:test";
import assert from "node:assert/strict";
import { ConfigError, applyFlagOverrides, flagSnapshot, parsePipelineConfig } from "../src/index.ts";
import { SAMPLE_PIPELINE_YAML } from "./config.test.ts";

const base = () => parsePipelineConfig(SAMPLE_PIPELINE_YAML, { env: {} }).config;

test("CC_FLAG_STAGES_<STAGE> toggles a single stage", () => {
  const { config, overrides } = applyFlagOverrides(base(), { CC_FLAG_STAGES_IMAGE: "off", CC_FLAG_STAGES_PUBLISH: "0" });
  assert.equal(config.flags.stages.image, false);
  assert.equal(config.flags.stages.publish, false);
  assert.equal(config.flags.stages.ingest, true);
  assert.deepEqual(
    overrides.map((o) => [o.path, o.value]),
    [
      ["flags.stages.image", false],
      ["flags.stages.publish", false],
    ],
  );
});

test("CC_FLAG_PUBLISH_TARGET must be a known target", () => {
  const { config } = applyFlagOverrides(base(), { CC_FLAG_PUBLISH_TARGET: "staging" });
  assert.equal(config.flags.publish_target, "staging");
  assert.throws(() => applyFlagOverrides(base(), { CC_FLAG_PUBLISH_TARGET: "prod" }), ConfigError);
});

test("unknown flags and non-boolean values fail loudly", () => {
  assert.throws(() => applyFlagOverrides(base(), { CC_FLAG_STAGES_IMAGES: "false" }), /unknown stage/);
  assert.throws(() => applyFlagOverrides(base(), { CC_FLAG_WHATEVER: "1" }), /unknown flag/);
  assert.throws(() => applyFlagOverrides(base(), { CC_FLAG_STAGES_QA: "maybe" }), /expected a boolean/);
});

test("unrelated environment variables are ignored and the input config is not mutated", () => {
  const original = base();
  const { config } = applyFlagOverrides(original, { PATH: "/usr/bin", HOME: "/root" });
  assert.deepEqual(config, original);
  applyFlagOverrides(original, { CC_FLAG_STAGES_QA: "false" });
  assert.equal(original.flags.stages.qa, true);
});

test("flagSnapshot records the applied state for the run ledger", () => {
  const { config, overrides } = applyFlagOverrides(base(), { CC_FLAG_STAGES_GENERATE: "false" });
  const snapshot = flagSnapshot(config, overrides);
  assert.equal(snapshot.stages.generate, false);
  assert.equal(snapshot.publish_target, "none");
  assert.equal(snapshot.overrides[0]?.env, "CC_FLAG_STAGES_GENERATE");
});

test("CC_FLAG_LLM_PROVIDER switches llm.provider for the Phase 4 shadow and rejects unknown providers; the snapshot records it", () => {
  const { config, overrides } = applyFlagOverrides(base(), { CC_FLAG_LLM_PROVIDER: "anthropic" });
  assert.equal(config.llm.provider, "anthropic");
  assert.deepEqual(overrides.map((o) => [o.env, o.path, o.value]), [["CC_FLAG_LLM_PROVIDER", "llm.provider", "anthropic"]]);
  assert.equal(flagSnapshot(config, overrides).llm_provider, "anthropic");
  assert.equal(flagSnapshot(base()).llm_provider, "fixture");
  assert.throws(() => applyFlagOverrides(base(), { CC_FLAG_LLM_PROVIDER: "openai" }), ConfigError);
  assert.equal(base().llm.provider, "fixture");
});

test("CC_FLAG_ESSAY (Phase 3e) switches essay.enabled — essays are not a stage, stage names are a DB enum; default off; the snapshot records it", () => {
  assert.equal(base().essay.enabled, false, "off unless the file or the environment turns it on");
  const { config, overrides } = applyFlagOverrides(base(), { CC_FLAG_ESSAY: "true" });
  assert.equal(config.essay.enabled, true);
  assert.deepEqual(overrides.map((o) => [o.env, o.path, o.value]), [["CC_FLAG_ESSAY", "essay.enabled", true]]);
  assert.equal(flagSnapshot(config, overrides).essay, true);
  assert.equal(flagSnapshot(base()).essay, false);
  assert.throws(() => applyFlagOverrides(base(), { CC_FLAG_ESSAY: "sometimes" }), /expected a boolean/);
  assert.throws(() => applyFlagOverrides(base(), { CC_FLAG_STAGES_ESSAY: "true" }), /unknown stage "essay"/);
  assert.deepEqual({ ...config.essay, enabled: false }, base().essay, "the other essay defaults stay");
});

test("CC_FLAG_ESSAY=sample (3e step 3) turns essays on and sets essay.sample for staging review runs; it is refused with a production publish target", () => {
  const { config, overrides } = applyFlagOverrides(base(), { CC_FLAG_ESSAY: "sample", CC_FLAG_PUBLISH_TARGET: "staging" });
  assert.equal(config.essay.enabled, true);
  assert.equal(config.essay.sample, true);
  assert.deepEqual(overrides.filter((o) => o.env === "CC_FLAG_ESSAY").map((o) => [o.path, o.value]), [["essay.enabled", true], ["essay.sample", true]]);
  const snapshot = flagSnapshot(config, overrides);
  assert.equal(snapshot.essay, true);
  assert.equal(snapshot.essay_sample, true);
  assert.equal(applyFlagOverrides(base(), { CC_FLAG_ESSAY: "true" }).config.essay.sample, false, "true is not sample");
  assert.throws(() => applyFlagOverrides(base(), { CC_FLAG_ESSAY: "sample", CC_FLAG_PUBLISH_TARGET: "production" }), (e: unknown) => e instanceof ConfigError && /staging review runs only/.test(e.message));
});
