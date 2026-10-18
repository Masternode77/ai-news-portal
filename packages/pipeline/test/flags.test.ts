import { test } from "node:test";
import assert from "node:assert/strict";
import { MemoryLedger } from "../src/ledger/index.ts";
import { runPipeline } from "../src/runner.ts";
import { baseRunOptions, testConfig } from "./helpers.ts";

test("CC_FLAG_STAGES_IMAGE=false skips the image stage and records the flag snapshot", async () => {
  const ledger = new MemoryLedger();
  const { config, overrides } = testConfig({ CC_FLAG_STAGES_IMAGE: "false" });
  const result = await runPipeline(baseRunOptions({ ledger, config, overrides }));
  assert.equal(result.status, "done");
  assert.equal(result.stages.find((s) => s.stage === "image")?.status, "skipped");
  assert.equal(result.stages.filter((s) => s.status === "done").length, 6);
  const dump = await ledger.dump();
  const flags = dump.runs[0]?.flags as { stages: Record<string, boolean>; overrides: { env: string }[] };
  assert.equal(flags.stages["image"], false);
  assert.equal(flags.overrides[0]?.env, "CC_FLAG_STAGES_IMAGE");
  const imageEvent = dump.stageEvents.find((e) => e.stage === "image");
  assert.equal(imageEvent?.status, "skipped");
  assert.equal(imageEvent?.counts["reason"], "flag_off");
  assert.equal(result.stages.find((s) => s.stage === "image")?.reason, "flag_off");
});

test("turning every stage off still produces a complete, well-formed run", async () => {
  const env = Object.fromEntries(["INGEST", "NORMALIZE", "SCORE", "GENERATE", "QA", "IMAGE", "PUBLISH"].map((s) => [`CC_FLAG_STAGES_${s}`, "0"]));
  const { config, overrides } = testConfig(env);
  const result = await runPipeline(baseRunOptions({ config, overrides }));
  assert.equal(result.status, "done");
  assert.ok(result.stages.every((s) => s.status === "skipped"));
  assert.equal(result.funnel.items_fetched, 0);
});

test("publish_target=none never calls the publisher even with items in flight", async () => {
  let calls = 0;
  const options = baseRunOptions();
  options.adapters.publishers["site"] = {
    target: "site",
    publish: async () => {
      calls += 1;
      return { slug: "news/x", url: "https://example.test/news/x/" };
    },
  };
  await runPipeline(options);
  assert.equal(calls, 0);
});
