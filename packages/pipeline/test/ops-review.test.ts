import { test } from "node:test";
import assert from "node:assert/strict";
import { MemoryDb } from "../src/db/index.ts";
import { REVIEW_STATUSES, collectReview, excerptsFor, formatReview, needlesFor } from "../src/ops/review.ts";

const RUN = "11111111-1111-4111-8111-111111111111";
const OTHER_RUN = "22222222-2222-4222-8222-222222222222";
const RAW = "33333333-3333-4333-8333-333333333333";
const CAND = "44444444-4444-4444-8444-444444444444";
const DRAFT = "55555555-5555-4555-8555-555555555555";
const DRAFT_OLD = "66666666-6666-4666-8666-666666666666";

const SOURCE_TEXT = "Chip Industry Week in Review. TSMC reported a $45B capex plan for the year, while Unit 1 of the fab in Arizona reached volume production. Separately, a 1,450 MW campus was announced.";

async function seeded(): Promise<MemoryDb> {
  const db = new MemoryDb();
  await db.insert("raw_items", [{ id: RAW, source_id: "semiconductor-engineering", canonical_url: "https://semiengineering.com/chip-industry-week-in-review-162/", content_hash: null, title: "Chip Industry Week In Review", published_at_source: "2026-10-29T12:00:00.000Z", fetched_at: "2026-10-30T08:33:00.000Z", payload: { body_text: SOURCE_TEXT }, run_id: RUN }]);
  await db.insert("candidates", [{ id: CAND, raw_item_id: RAW, run_id: RUN, rubric_version: "score/2026-10-30.1", scores: {}, total: 0.8, selected: true, reject_reason: null, rubric: null, created_at: "2026-10-30T08:33:10.000Z" }]);
  await db.insert("drafts", [
    { id: DRAFT, candidate_id: CAND, run_id: RUN, content_type: "news_brief", prompt_version: "2026-10-24.1", model: "claude-opus-5-5", body: { brief: { title_ko: "TSMC 450억 달러 투자", summary_ko: "요약 본문", why_it_matters_ko: "의미", expert_lens_ko: "렌즈", tags: ["tsmc", "capex"], slug: "news/65121580186fd621", source_url: "https://semiengineering.com/chip-industry-week-in-review-162/" }, checks: { grounding: { numbers: ["450억", "1"], ungrounded: ["450억", "1"], pass: false }, quote_max_words: 2, banned: { version: "x", matches: [], pass: true } }, source: { raw_item_id: RAW, source_id: "semiconductor-engineering" } }, input_tokens: 2809, output_tokens: 1627, cost_usd: 0.043776, review_status: "rejected", created_at: "2026-10-30T08:34:19.000Z" },
    { id: DRAFT_OLD, candidate_id: CAND, run_id: OTHER_RUN, content_type: "news_brief", prompt_version: "2026-10-24.1", model: "claude-opus-5-5", body: { brief: { title_ko: "이전 초안", tags: [] }, checks: {}, source: { raw_item_id: RAW } }, input_tokens: 0, output_tokens: 0, cost_usd: 0, review_status: "pending", created_at: "2026-10-30T08:24:00.000Z" },
  ]);
  await db.insert("qa_results", [
    { id: "77777777-7777-4777-8777-777777777771", draft_id: DRAFT, rule: "UNGROUNDED_NUMBER", severity: "hard", pass: false, reason_code: "UNGROUNDED_NUMBER", evidence: { numbers: 2, ungrounded: ["450억", "1"], max_ungrounded: 0, source_text: true }, checked_at: "2026-10-30T08:34:37.000Z" },
    { id: "77777777-7777-4777-8777-777777777772", draft_id: DRAFT, rule: "RUBRIC_BELOW_TARGET", severity: "soft", pass: false, reason_code: "RUBRIC_BELOW_TARGET", evidence: { total: 0.61 }, checked_at: "2026-10-30T08:34:37.100Z" },
    // An earlier evaluation of the same draft id (the body before regeneration passed grounding): must not show.
    { id: "77777777-7777-4777-8777-777777777773", draft_id: DRAFT, rule: "UNGROUNDED_NUMBER", severity: "hard", pass: true, reason_code: "UNGROUNDED_NUMBER", evidence: { numbers: 1, ungrounded: [], max_ungrounded: 0, source_text: true }, checked_at: "2026-10-30T08:24:40.000Z" },
  ]);
  return db;
}

test("needles and excerpts: a Korean-scaled number finds its abbreviated dollar figure, bare numbers respect number boundaries", () => {
  assert.deepEqual(needlesFor("450억"), ["450", "45"]);
  assert.deepEqual(needlesFor("2.1 billion"), ["2.1"]);
  assert.deepEqual(needlesFor("1"), ["1"]);
  assert.deepEqual(needlesFor("억"), []);
  const dollars = excerptsFor(SOURCE_TEXT, "450억", 20);
  assert.equal(dollars.snippets.length, 1, "450 is absent, 45 matches once ($45B) and not inside 1,450");
  assert.match(dollars.snippets[0]!, /\$«45»B capex/);
  const one = excerptsFor(SOURCE_TEXT, "1", 12);
  assert.ok(one.snippets.some((snippet) => /Unit «1» of/.test(snippet)), JSON.stringify(one.snippets));
  assert.ok(one.snippets.every((snippet) => !/«1»,450/.test(snippet)), "1 does not match the leading digit of 1,450");
  assert.deepEqual(excerptsFor(SOURCE_TEXT, "999", 20).snippets, []);
});

test("collectReview joins drafts, QA verdicts and the source item; run and status filters and the limit apply; formatReview renders the brief, the verdict table and the source windows", async () => {
  const db = await seeded();
  const byRun = await collectReview(db, { runId: RUN });
  assert.equal(byRun.length, 1);
  const entry = byRun[0]!;
  assert.equal(entry.slug, "news/65121580186fd621");
  assert.equal(entry.source_id, "semiconductor-engineering");
  assert.equal(entry.review_status, "rejected");
  assert.equal(entry.brief.title_ko, "TSMC 450억 달러 투자");
  assert.deepEqual(entry.checks.ungrounded, ["450억", "1"]);
  assert.equal(entry.checks.grounding_pass, false);
  assert.equal(entry.qa.length, 2, "one verdict per rule");
  assert.equal(entry.qa_hidden, 1, "the earlier evaluation's verdict is counted, not shown");
  const grounding = entry.qa.find((verdict) => verdict.rule === "UNGROUNDED_NUMBER")!;
  assert.equal(grounding.pass, false, "the newest verdict for the rule wins over the older pass");
  assert.equal(grounding.checked_at, "2026-10-30T08:34:37.000Z");
  assert.equal(entry.source_chars, SOURCE_TEXT.length);
  assert.equal(entry.excerpts[0]!.token, "450억");
  assert.match(entry.excerpts[0]!.snippets[0]!, /«45»B/);

  const rejected = await collectReview(db, { status: "rejected" });
  assert.deepEqual(rejected.map((row) => row.draft_id), [DRAFT]);
  const pending = await collectReview(db, { status: "pending" });
  assert.deepEqual(pending.map((row) => row.draft_id), [DRAFT_OLD]);
  const any = await collectReview(db, { status: "any" });
  assert.deepEqual(any.map((row) => row.draft_id), [DRAFT, DRAFT_OLD], "newest first");
  assert.equal((await collectReview(db, { status: "any", limit: 1 })).length, 1);
  assert.equal((await collectReview(db, { status: "approved" })).length, 0);
  assert.ok(REVIEW_STATUSES.includes("any"));

  const markdown = formatReview(byRun, { runId: RUN });
  assert.match(markdown, /^# Shadow review — run `11111111-1111-4111-8111-111111111111` · 1 draft\n/);
  assert.match(markdown, /## 1\. TSMC 450억 달러 투자/);
  assert.match(markdown, /review_status \*\*rejected\*\*/);
  assert.match(markdown, /\*\*QA\*\* \(newest verdict per rule · 1 older verdict from earlier evaluations of this draft hidden\):/);
  assert.match(markdown, /\| UNGROUNDED_NUMBER \| hard \| ✗ \| UNGROUNDED_NUMBER \| 2026-10-30T08:34:37\.000Z \|/);
  assert.doesNotMatch(markdown, /\| UNGROUNDED_NUMBER \| hard \| ✓ \|/, "the older passing verdict is not rendered");
  assert.match(markdown, /\*\*원문 대조 `450억`\*\* \(검색: `450`, `45`\):\n- .*«45»B/);
  assert.match(markdown, /\*\*원문 대조 `1`\*\*/);
  assert.match(formatReview([], { status: "rejected" }), /No drafts matched\./);
});
