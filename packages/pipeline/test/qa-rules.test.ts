import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { candidateId, draftId, newsBriefSlug, rawItemId } from "@cc/shared";
import type { CandidateInsert, DraftInsert, QaEvidence, QaRuleConfig, RawItemInsert, SourceConfig } from "@cc/shared";
import { QA_RULES } from "../src/qa/registry.ts";
import { concreteTokens, hangulRatio, latinProperNouns, quotedSpans, sentences, shingles } from "../src/qa/text.ts";
import { numberParam } from "../src/qa/verdict.ts";
import { testBannedPhrases } from "./helpers.ts";

const NOW = new Date("2026-10-25T00:45:00Z");
const RUN_ID = "11111111-1111-4111-8111-111111111111";
const URL = "https://a.example.com/busan";
const TITLE = "Microsoft signs 1.2 GW capacity agreement with Example Data Centers in Busan";
const BODY = "Microsoft has signed a 1.2 GW capacity agreement with Example Data Centers for an AI data center campus in Busan, the companies said on Monday. The first 200 MW phase is scheduled to reach ready-for-service in 2028, with grid interconnection secured from KEPCO through a new 345 kV substation and liquid cooling for GPU clusters. Financing of $2.1 billion is being arranged with a consortium of Korean lenders, and the operator said rack densities above 100 kW will be supported from day one. Example Data Centers said the Busan site was chosen for its proximity to the new substation and to subsea cable landings, and that the campus will be built in phases as grid capacity is released.";

const BRIEF = {
  title_ko: "Microsoft, 부산 AI 데이터센터 캠퍼스에 1.2 GW 용량 계약 체결",
  summary_ko: "Microsoft가 Example Data Centers와 부산의 AI 데이터센터 캠퍼스에 대해 1.2 GW 규모의 용량 계약을 맺었다고 두 회사가 월요일 밝혔다. 1단계 200 MW는 2028년 ready-for-service를 목표로 하며, 계통 접속은 KEPCO가 새로 짓는 345 kV 변전소를 통해 확보했다.\n\n캠퍼스는 GPU 클러스터용 액체 냉각을 적용하고, 운영사는 첫날부터 100 kW를 넘는 랙 밀도를 지원한다고 설명했다. 자금은 한국 금융기관 컨소시엄과 21억 달러 규모의 금융 조달을 협의 중이다. 원문은 임대 기간과 단가는 밝히지 않았다.",
  why_it_matters_ko: "국내에서 단일 하이퍼스케일러가 GW 단위 용량을 한 캠퍼스에 묶는 계약은 드물다. 비수도권 입지와 한전 변전소 신설이 대형 AI 수요의 실제 경로가 되고 있음을 보여주며, 국내 운영사와 금융기관에는 참조 거래가 생긴 셈이다.",
  expert_lens_ko: "1.2 GW 계약과 200 MW 1단계 사이의 간극이 핵심이다. 2028년 RFS는 345 kV 변전소 준공과 송전 보강이 동시에 맞아야 가능하며, 원문은 그 공정 리스크를 다루지 않는다. 21억 달러 금융은 1단계 규모에 비해 커 보여 후속 단계까지 포함한 약정일 가능성이 있다. 다음에 확인할 신호는 한전의 계통 접속 승인 시점이다.",
  tags: ["hyperscale", "korea", "power", "grid", "financing", "cooling"],
  source_url: URL,
  source_name: "Source a",
  published_at_source: "2026-10-19T22:00:00.000Z",
  slug: newsBriefSlug(URL, TITLE),
};

function source(overrides: Partial<SourceConfig> = {}): SourceConfig {
  return { id: "a", name: "Source a", type: "rss", url: "https://a.example.com/feed.xml", tier: 1, enabled: true, text_rights: "full", ...overrides };
}

function rawItem(overrides: Partial<RawItemInsert> = {}, payload: Record<string, unknown> = {}): RawItemInsert {
  return { id: rawItemId(URL), source_id: "a", canonical_url: URL, title: TITLE, published_at_source: "2026-10-19T22:00:00.000Z", fetched_at: NOW.toISOString(), payload: { body_text: BODY, extraction: { ok: true, method: "generic", chars: BODY.length }, ...payload }, ...overrides };
}

function candidate(total = 0.86): CandidateInsert {
  const id = candidateId(rawItemId(URL), "score/test");
  return { id, raw_item_id: rawItemId(URL), run_id: RUN_ID, rubric_version: "score/test", scores: { relevance: 0.9, timeliness: 1, impact: 0.8, reader_value: 0.8, insight_potential: 0.7 }, total, selected: true, reject_reason: null, rubric: { tier: total >= 0.75 ? "full" : "brief", rank: 1, insight_eligible: true, reasons: { relevance: "r", timeliness: "t", impact: "i", reader_value: "v", insight_potential: "p" } } };
}

function draft(brief: Record<string, unknown> = BRIEF): DraftInsert {
  const cid = candidateId(rawItemId(URL), "score/test");
  return { id: draftId(cid, "news_brief", "2026-10-25.1"), candidate_id: cid, run_id: RUN_ID, content_type: "news_brief", prompt_version: "2026-10-25.1", model: "fixture", body: { brief, checks: {}, source: { raw_item_id: rawItemId(URL), canonical_url: URL, source_id: "a", text_rights: "full", text_scope: "full", chars: BODY.length } }, input_tokens: 0, output_tokens: 0, cost_usd: 0, review_status: "none" };
}

function evidence(overrides: Partial<QaEvidence> = {}): QaEvidence {
  const item = rawItem();
  return { sourceText: [TITLE, BODY, "Source a", "2026-10-19T22:00:00.000Z"].join("\n"), source: source(), rawItem: item, candidate: candidate(), bannedPhrases: testBannedPhrases(), recentPublishedTitles: [], now: NOW, ...overrides };
}

function entry(rule: string, params: Record<string, unknown> = {}, severity: "hard" | "soft" = "hard", auto_pass?: boolean): QaRuleConfig {
  return { rule, severity, enabled: true, stage: "qa", params, ...(auto_pass === undefined ? {} : { auto_pass }) };
}

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
  const pasted = { ...BRIEF, summary_ko: `${BODY}\n\n${BODY}`, why_it_matters_ko: BODY, expert_lens_ko: BODY };
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
  const english = { ...BRIEF, summary_ko: `${BODY} ${BODY}`, why_it_matters_ko: BODY, expert_lens_ko: BODY };
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
  const thin = await check("THIN_EXPERT_LENS", draft({ ...BRIEF, expert_lens_ko: "이 계약은 중요하다고 본다. 더 지켜볼 일이다. 다음 신호를 기다린다. 이상이다. 끝으로 한 마디를 더 적어 둔다. 그리고 또 한 문장을 더 쓴다. 마지막으로 결론을 맺는다." }), evidence(), {}, "soft");
  assert.equal(thin.pass, false);
  assert.equal(thin.evidence["concrete"], 0);
  assert.deepEqual(concreteTokens("345 kV 변전소와 2.1 billion, Microsoft"), ["345 kV", "2.1", "Microsoft"]);
  assert.equal(sentences("첫 문장이다. 두 번째 문장이다! 세 번째?").length, 3);
});

test("verdict params: a non-numeric param is a loud configuration error, not a silent default", () => {
  assert.throws(() => numberParam(entry("X", { k: "20" }), "k", 1), /QA_PARAM_INVALID/);
  assert.equal(numberParam(entry("X", {}), "k", 7), 7);
});
