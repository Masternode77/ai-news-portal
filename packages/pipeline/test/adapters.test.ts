import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { RawItemInsert } from "@cc/shared";
import type { StageContext } from "@cc/shared";
import { createFixtureLlmAdapter, createFixtureRssAdapter, createPlaceholderImageAdapter, decodeXmlText, parseRssItems, toIsoDate } from "../src/adapters/index.ts";
import { createBudget } from "../src/budget.ts";
import { FIXTURES_DIR, baseRunOptions, testSources } from "./helpers.ts";

function ctxStub(): StageContext {
  const options = baseRunOptions();
  return {
    runId: "11111111-1111-4111-8111-111111111111",
    now: new Date("2026-10-18T00:45:00Z"),
    config: options.config,
    scoring: options.scoring,
    bannedPhrases: options.bannedPhrases,
    qa: options.qa,
    logger: options.logger,
    ledger: options.ledger,
    budget: createBudget(options.config.budget),
    dryRun: true,
    replay: true,
    fixtureName: "sample",
    fetch: () => Promise.reject(new Error("no network")),
    adapters: options.adapters,
  };
}

test("parseRssItems handles CDATA, entities and missing fields", () => {
  const xml = `<rss><channel>
    <item><title><![CDATA[A &amp; B]]></title><link>https://x.test/a?x=1&amp;y=2</link><pubDate>Wed, 07 Oct 2026 07:00:00 GMT</pubDate><description><![CDATA[<p>hi</p>]]></description></item>
    <item><title>no link</title></item>
    <item><title>Caf&#233; &#x41;</title><link>https://x.test/b</link></item>
  </channel></rss>`;
  const items = parseRssItems(xml);
  assert.equal(items.length, 2);
  assert.equal(items[0]?.title, "A & B");
  assert.equal(items[0]?.link, "https://x.test/a?x=1&y=2");
  assert.equal(items[0]?.description, "<p>hi</p>");
  assert.equal(items[1]?.title, "Café A");
  assert.equal(toIsoDate(items[0]?.pubDate ?? null), "2026-10-07T07:00:00.000Z");
  assert.equal(toIsoDate("not a date"), null);
  assert.equal(decodeXmlText("&quot;q&quot; &apos;a&apos; &lt;b&gt;"), "\"q\" 'a' <b>");
});

test("fixture RSS adapter yields RawItemInsert rows from fixtures/rss/sample.xml", async () => {
  const adapter = createFixtureRssAdapter({ fixturesDir: FIXTURES_DIR, fixtureName: "sample" });
  const source = testSources()[0]!;
  const items = await adapter.fetch(source, ctxStub());
  assert.equal(items.length, 30);
  for (const item of items) assert.equal(RawItemInsert.safeParse(item).success, true, JSON.stringify(item).slice(0, 200));
  assert.equal(items[0]?.source_id, source.id);
  assert.equal(items[0]?.fetched_at, "2026-10-18T00:45:00.000Z");
  const xml = await readFile(join(FIXTURES_DIR, "rss", "sample.xml"), "utf8");
  assert.equal((xml.match(/<item>/g) ?? []).length, 30);
});

test("fixture RSS adapter fails explicitly when the fixture is missing", async () => {
  const adapter = createFixtureRssAdapter({ fixturesDir: FIXTURES_DIR, fixtureName: "does-not-exist" });
  await assert.rejects(adapter.fetch(testSources()[0]!, ctxStub()), /FIXTURE_MISSING/);
});

test("fixture LLM adapter replays the recorded response and records cost", async () => {
  const adapter = createFixtureLlmAdapter({ fixturesDir: FIXTURES_DIR });
  const ctx = ctxStub();
  const response = await adapter.complete(
    { task: "news_brief", model: "fixture", system: "", messages: [{ role: "user", content: "x" }], maxOutputTokens: 10, promptVersion: "test" },
    ctx,
  );
  assert.equal(response.model, "fixture");
  assert.equal(ctx.budget.calls, 1);
  assert.equal(ctx.budget.spentUsd, 0);
  await assert.rejects(
    adapter.complete({ task: "curate", model: "fixture", system: "", messages: [{ role: "user", content: "x" }], maxOutputTokens: 10, promptVersion: "test" }, ctx),
    /FIXTURE_MISSING/,
  );
});

test("placeholder image adapter never fails and flags itself", async () => {
  const image = await createPlaceholderImageAdapter().generate({ prompt: "p", alt: "", slug: "news/x" }, ctxStub());
  assert.equal(image.placeholder, true);
  assert.equal(image.costUsd, 0);
  assert.equal(image.provenance.provider, "placeholder");
  assert.ok(image.alt.length > 0);
});

test("budget guard transitions ok -> soft_warn -> exceeded and refuses overspend", () => {
  const budget = createBudget({ run_usd: 2, soft_warn_usd: 1.5, max_calls: 3 });
  assert.equal(budget.state(), "ok");
  assert.equal(budget.canSpend(1.9), true);
  assert.equal(budget.canSpend(2.1), false);
  budget.record(1.5);
  assert.equal(budget.state(), "soft_warn");
  budget.record(0.6);
  assert.equal(budget.state(), "exceeded");
  assert.equal(budget.canSpend(0), false);
  assert.throws(() => budget.record(-1), RangeError);
  const capped = createBudget({ run_usd: 10, soft_warn_usd: 5, max_calls: 1 });
  capped.record(0.01);
  assert.equal(capped.canSpend(0.01), false, "call cap reached");
});
