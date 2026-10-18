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
