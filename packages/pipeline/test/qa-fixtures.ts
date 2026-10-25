/**
 * Shared QA test material (Phase 3g): a clean Korean news_brief resting on a reachable
 * full-text source, plus the raw item, source, candidate and evidence around it. Rule
 * and stage tests perturb one field at a time from here.
 */
import { candidateId, draftId, newsBriefSlug, rawItemId } from "@cc/shared";
import type { CandidateInsert, DraftInsert, QaEvidence, QaRuleConfig, RawItemInsert, SourceConfig } from "@cc/shared";
import { testBannedPhrases } from "./helpers.ts";

export const NOW = new Date("2026-10-25T00:45:00Z");
export const RUN_ID = "11111111-1111-4111-8111-111111111111";
export const URL = "https://a.example.com/busan";
export const TITLE = "Microsoft signs 1.2 GW capacity agreement with Example Data Centers in Busan";
export const BODY = "Microsoft has signed a 1.2 GW capacity agreement with Example Data Centers for an AI data center campus in Busan, the companies said on Monday. The first 200 MW phase is scheduled to reach ready-for-service in 2028, with grid interconnection secured from KEPCO through a new 345 kV substation and liquid cooling for GPU clusters. Financing of $2.1 billion is being arranged with a consortium of Korean lenders, and the operator said rack densities above 100 kW will be supported from day one. Example Data Centers said the Busan site was chosen for its proximity to the new substation and to subsea cable landings, and that the campus will be built in phases as grid capacity is released.";

export const BRIEF = {
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

export function source(overrides: Partial<SourceConfig> = {}): SourceConfig {
  return { id: "a", name: "Source a", type: "rss", url: "https://a.example.com/feed.xml", tier: 1, enabled: true, text_rights: "full", ...overrides };
}

export function rawItem(overrides: Partial<RawItemInsert> = {}, payload: Record<string, unknown> = {}): RawItemInsert {
  return { id: rawItemId(URL), source_id: "a", canonical_url: URL, title: TITLE, published_at_source: "2026-10-19T22:00:00.000Z", fetched_at: NOW.toISOString(), payload: { body_text: BODY, extraction: { ok: true, method: "generic", chars: BODY.length }, ...payload }, ...overrides };
}

export function candidate(total = 0.86): CandidateInsert {
  const id = candidateId(rawItemId(URL), "score/test");
  return { id, raw_item_id: rawItemId(URL), run_id: RUN_ID, rubric_version: "score/test", scores: { relevance: 0.9, timeliness: 1, impact: 0.8, reader_value: 0.8, insight_potential: 0.7 }, total, selected: true, reject_reason: null, rubric: { tier: total >= 0.75 ? "full" : "brief", rank: 1, insight_eligible: true, reasons: { relevance: "r", timeliness: "t", impact: "i", reader_value: "v", insight_potential: "p" } } };
}

export function draft(brief: Record<string, unknown> = BRIEF, options: { promptVersion?: string } = {}): DraftInsert {
  const cid = candidateId(rawItemId(URL), "score/test");
  const promptVersion = options.promptVersion ?? "2026-10-25.1";
  return { id: draftId(cid, "news_brief", promptVersion), candidate_id: cid, run_id: RUN_ID, content_type: "news_brief", prompt_version: promptVersion, model: "fixture", body: { brief, checks: {}, source: { raw_item_id: rawItemId(URL), canonical_url: URL, source_id: "a", text_rights: "full", text_scope: "full", chars: BODY.length } }, input_tokens: 0, output_tokens: 0, cost_usd: 0, review_status: "none" };
}

export function evidence(overrides: Partial<QaEvidence> = {}): QaEvidence {
  const item = rawItem();
  return { sourceText: [TITLE, BODY, "Source a", "2026-10-19T22:00:00.000Z"].join("\n"), source: source(), rawItem: item, candidate: candidate(), bannedPhrases: testBannedPhrases(), recentPublishedTitles: [], now: NOW, ...overrides };
}

export function entry(rule: string, params: Record<string, unknown> = {}, severity: "hard" | "soft" = "hard", auto_pass?: boolean): QaRuleConfig {
  return { rule, severity, enabled: true, stage: "qa", params, ...(auto_pass === undefined ? {} : { auto_pass }) };
}


/** ≥150 chars, ≥3 sentences, no number and no Latin name: fails THIN_EXPERT_LENS and nothing else. */
export const THIN_LENS = "이 계약은 중요하다고 본다. 더 지켜볼 일이다. 다음 신호를 기다린다. 이상이다. 끝으로 한 마디를 더 적어 둔다. 그리고 또 한 문장을 더 쓴다. 마지막으로 결론을 맺는다. 시장은 늘 그렇듯 조금 더 기다려 보라고 말한다. 업계 관계자들도 비슷한 이야기를 반복한다. 결국 시간이 답을 줄 것이다.";
