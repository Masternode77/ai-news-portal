import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import type { DraftInsert, QaEvidence } from "@cc/shared";
import { QA_RULES } from "../src/qa/registry.ts";
import { concreteTokens, hangulRatio, latinProperNouns, quotedSpans, sentences, shingles } from "../src/qa/text.ts";
import { numberParam } from "../src/qa/verdict.ts";
import { testBannedPhrases } from "./helpers.ts";
import { BRIEF, BODY, NOW, THIN_LENS, TITLE, candidate, draft, entry, evidence, rawItem, source } from "./qa-fixtures.ts";

async function check(rule: string, d: DraftInsert, ev: QaEvidence, params: Record<string, unknown> = {}, severity: "hard" | "soft" = "hard") {
  const impl = QA_RULES.get(rule);
  if (!impl) throw new Error(`no rule ${rule}`);
  return impl.check(d, ev, entry(rule, params, severity));
}

test("registry: every rules/*.ts file is registered under its own name and emits that name as rule and reason_code (ADR-004: rule add = one file)", async () => {
  const files = readdirSync(resolve(import.meta.dirname, "../src/qa/rules")).filter((f) => f.endsWith(".ts")).map((f) => f.replace(/\.ts$/, "")).sort();
  assert.deepEqual([...QA_RULES.keys()].sort(), files);
  for (const code of files) {
    const v = await check(code, draft(), evidence());
    assert.equal(v.rule, code);
    assert.equal(v.reason_code, code);
    assert.equal(v.checked_at, NOW.toISOString());
    assert.ok(v.evidence && typeof v.evidence === "object" && "params" in v.evidence, `${code} evidence carries the params it used`);
  }
});

test("a clean brief from a reachable full-text source passes every hard rule and every soft rule", async () => {
  for (const code of QA_RULES.keys()) {
    const v = await check(code, draft(), evidence());
    assert.equal(v.pass, true, `${code}: ${JSON.stringify(v.evidence)}`);
  }
});

test("SCHEMA_INVALID: a body whose brief lacks the source fields or has an unsupported content_type fails with the zod issues as evidence", async () => {
  const { source_url: _u, ...noSource } = BRIEF;
  const v = await check("SCHEMA_INVALID", draft(noSource), evidence());
  assert.equal(v.pass, false);
  assert.ok((v.evidence["issues"] as string[]).some((i) => i.startsWith("source_url")));
  const essay = { ...draft(), content_type: "insight_essay" as const };
  const w = await check("SCHEMA_INVALID", essay, evidence());
  assert.equal(w.pass, false);
  assert.ok((w.evidence["issues"] as string[]).some((i) => /insight_essay/.test(i)));
});

test("SOURCE_UNREACHABLE: missing item, a failed extraction on a full source, or too little source text fail; rewrite_only needs only the item", async () => {
  assert.equal((await check("SOURCE_UNREACHABLE", draft(), evidence({ rawItem: undefined, sourceText: null }))).pass, false, "no raw item");
  const failed = rawItem({}, { extraction: { ok: false, error: "HTTP_404" } });
  const f = await check("SOURCE_UNREACHABLE", draft(), evidence({ rawItem: failed }));
  assert.equal(f.pass, false);
  assert.equal(f.evidence["extraction_attempted"], true);
  const short = rawItem({}, { body_text: "short", extraction: { ok: true, method: "generic", chars: 5 } });
  const s = await check("SOURCE_UNREACHABLE", draft(), evidence({ rawItem: short }));
  assert.equal(s.pass, false);
  assert.equal(s.evidence["source_chars"], 5);
  const notAttempted = rawItem({}, { body_text: undefined, extraction: undefined, description: BODY.slice(0, 520) });
  assert.equal((await check("SOURCE_UNREACHABLE", draft(), evidence({ rawItem: notAttempted }))).pass, true, "never attempted but enough feed text");
  const rewrite = rawItem({}, { body_text: undefined, extraction: undefined, description: "a short feed summary" });
  assert.equal((await check("SOURCE_UNREACHABLE", draft(), evidence({ rawItem: rewrite, source: source({ text_rights: "rewrite_only" }) }))).pass, true, "rewrite_only: item is enough");
  assert.equal((await check("SOURCE_UNREACHABLE", draft(), evidence({ rawItem: short }), { min_source_chars: 5 })).pass, true, "threshold comes from params");
});

test("QUOTE_TOO_LONG: a run of more than max_quote_words shared with the source or more than max_quotes quoted spans fails", async () => {
  const copied = { ...BRIEF, summary_ko: `${BRIEF.summary_ko} 원문: Microsoft has signed a 1.2 GW capacity agreement with Example Data Centers for an AI data center campus in Busan the companies said on Monday the first 200 MW phase is scheduled to reach ready-for-service in 2028.` };
  const v = await check("QUOTE_TOO_LONG", draft(copied), evidence());
  assert.equal(v.pass, false);
  assert.ok((v.evidence["longest_shared_run"] as number) > 20);
  assert.equal((await check("QUOTE_TOO_LONG", draft(copied), evidence(), { max_quote_words: 60 })).pass, true, "threshold from params");
  const twoQuotes = { ...BRIEF, summary_ko: `${BRIEF.summary_ko} 회사는 "first 200 MW phase"라고 했고 다시 "liquid cooling for GPU clusters"라고 적었다.` };
  const q = await check("QUOTE_TOO_LONG", draft(twoQuotes), evidence());
  assert.equal(q.pass, false);
  assert.equal(q.evidence["quoted_spans"], 2);
  assert.equal(quotedSpans('a "one" and “two” and "x"').length, 2, "single characters are not quotes");
});

test("SIMILARITY_TOO_HIGH: pasted source passages raise the shingle overlap and the copied-sentence share above the legacy limits", async () => {
  const pasted = { ...BRIEF, summary_ko: BODY, why_it_matters_ko: BODY, expert_lens_ko: BODY };
  const v = await check("SIMILARITY_TOO_HIGH", draft(pasted), evidence());
  assert.equal(v.pass, false);
  assert.ok((v.evidence["overlap"] as number) > 0.22, JSON.stringify(v.evidence));
  assert.ok((v.evidence["sentence_reuse"] as number) > 0.15);
  assert.equal((await check("SIMILARITY_TOO_HIGH", draft(pasted), evidence({ sourceText: null, rawItem: undefined }))).pass, true, "no source text → nothing to compare (SOURCE_UNREACHABLE catches the missing item)");
  assert.equal(shingles("a b c d e", 4).length, 2);
});

test("UNGROUNDED_NUMBER and UNGROUNDED_ENTITY: a number or a Latin name that is not in the source fails; all-caps acronyms and allow-listed names are not entities", async () => {
  const n = await check("UNGROUNDED_NUMBER", draft({ ...BRIEF, summary_ko: `${BRIEF.summary_ko} 2027년에는 2단계가 시작된다.` }), evidence());
  assert.equal(n.pass, false);
  assert.deepEqual(n.evidence["ungrounded"], ["2027"]);
  const e = await check("UNGROUNDED_ENTITY", draft({ ...BRIEF, expert_lens_ko: `${BRIEF.expert_lens_ko} Nvidia와 Oracle도 비슷한 계약을 검토 중이다.` }), evidence());
  assert.equal(e.pass, false);
  assert.deepEqual(e.evidence["ungrounded"], ["Nvidia", "Oracle"]);
  assert.equal((await check("UNGROUNDED_ENTITY", draft({ ...BRIEF, expert_lens_ko: `${BRIEF.expert_lens_ko} Nvidia도 검토 중이다.` }), evidence(), { allow: ["Nvidia"] })).pass, true, "allow list");
  assert.deepEqual(latinProperNouns("RFS와 PPA는 GW 단위다. Microsoft and Example Data Centers.", 3).filter((x) => /[a-z]/.test(x)), ["Microsoft", "Example Data Centers"]);
});

test("LANG_MISMATCH and BANNED_PATTERN: an English-heavy brief and a banned phrase fail", async () => {
  const english = { ...BRIEF, summary_ko: BODY, why_it_matters_ko: BODY, expert_lens_ko: BODY };
  const l = await check("LANG_MISMATCH", draft(english), evidence());
  assert.equal(l.pass, false);
  assert.ok((l.evidence["hangul_ratio"] as number) < 0.6);
  assert.ok(hangulRatio("한글 Microsoft") > 0.1 && hangulRatio("1.2 GW") === 0 && hangulRatio("123") === 1);
  const b = await check("BANNED_PATTERN", draft({ ...BRIEF, title_ko: "게임 체인저가 된 부산 1.2 GW 계약" }), evidence());
  assert.equal(b.pass, false);
  assert.deepEqual(b.evidence["matches"], ["phrase:게임 체인저"]);
  assert.equal(b.evidence["inventory_version"], testBannedPhrases().version);
});

test("soft rules: RUBRIC_BELOW_TARGET, READABILITY_LOW, SEO_FIELDS_MISSING and THIN_EXPERT_LENS report their measures and thresholds", async () => {
  const r = await check("RUBRIC_BELOW_TARGET", draft(), evidence({ candidate: candidate(0.62) }), {}, "soft");
  assert.equal(r.pass, false);
  assert.equal(r.evidence["total"], 0.62);
  assert.equal((await check("RUBRIC_BELOW_TARGET", draft(), evidence({ candidate: undefined }), {}, "soft")).pass, true, "no candidate → nothing to judge");
  const repetitive = { ...BRIEF, summary_ko: "이 계약은 크다. 이 계약은 길다. 이 계약은 새롭다. 이 계약은 부산에 있다. ".repeat(3) + BRIEF.summary_ko };
  const rd = await check("READABILITY_LOW", draft(repetitive), evidence(), {}, "soft");
  assert.equal(rd.pass, false);
  assert.ok((rd.evidence["max_same_opening_count"] as number) > 2);
  const longSentence = { ...BRIEF, why_it_matters_ko: `${"매우 ".repeat(45)}중요한 계약이다.`, summary_ko: BRIEF.summary_ko.replace(/\. /g, " ").replace(/\n\n/g, " ") };
  assert.equal((await check("READABILITY_LOW", draft(longSentence), evidence(), { max_avg_sentence_words: 10 }, "soft")).pass, false, "average sentence length threshold from params");
  const seo = await check("SEO_FIELDS_MISSING", draft({ ...BRIEF, summary_ko: `짧은 첫 단락.\n\n${BRIEF.summary_ko}` }), evidence(), {}, "soft");
  assert.equal(seo.pass, false);
  assert.equal(seo.evidence["description_chars"], "짧은 첫 단락.".length);
  const thin = await check("THIN_EXPERT_LENS", draft({ ...BRIEF, expert_lens_ko: THIN_LENS }), evidence(), {}, "soft");
  assert.equal(thin.pass, false);
  assert.equal(thin.evidence["concrete"], 0);
  assert.deepEqual(concreteTokens("345 kV 변전소와 2.1 billion, Microsoft"), ["345 kV", "2.1", "Microsoft"]);
  assert.equal(sentences("첫 문장이다. 두 번째 문장이다! 세 번째?").length, 3);
});

test("verdict params: a non-numeric param is a loud configuration error, not a silent default", () => {
  assert.throws(() => numberParam(entry("X", { k: "20" }), "k", 1), /QA_PARAM_INVALID/);
  assert.equal(numberParam(entry("X", {}), "k", 7), 7);
});
