/**
 * Shared QA test material (Phase 3g): a clean English news_brief (ADR-009) resting on a reachable
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
  title: "Microsoft books 1.2 GW of capacity at Example Data Centers' planned campus in Busan",
  summary: "Microsoft has committed to 1.2 GW of capacity at an AI campus that Example Data Centers plans to build in Busan, the companies announced on Monday. Delivery starts with a 200 MW first phase targeted for ready-for-service in 2028.\n\nPower will come through a new 345 kV substation, with the grid connection secured from KEPCO. The operator plans liquid cooling for its GPU clusters and says racks drawing more than 100 kW will be supported at opening. A group of Korean lenders is arranging $2.1 billion of financing. The lease term and pricing were not disclosed.",
  why_it_matters: "Gigawatt-scale commitments from a single hyperscaler on one Korean campus are uncommon. Busan secured its grid connection outside the constrained capital region, a sign that new substations now decide where large AI loads can go in Korea, and it gives global operators and lenders a reference deal.",
  expert_lens: "The gap between the 1.2 GW headline and the 200 MW first phase is the figure that matters. Meeting a 2028 ready-for-service date depends on the 345 kV substation and the related grid work landing on time, a risk the announcement leaves unaddressed. The $2.1 billion financing looks large for a first phase alone, which suggests it may also cover later phases. The next signal is the timing of KEPCO's interconnection approval.",
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


/** ≥300 chars, ≥3 sentences, no number and no mid-sentence name: fails THIN_EXPERT_LENS and nothing else. */
export const THIN_LENS = "This deal looks important, and it deserves a closer look over time. It is too early to say how it will play out. The market will want more detail before it reacts to the news. Buyers and lenders will keep asking the same questions for a while. Patience remains the only sensible stance for now, until more detail arrives. More clarity should come with the next announcement.";

/** Korean reader text long enough for every field's schema minimum (LANG_MISMATCH tests). */
export const KOREAN_TEXT = "마이크로소프트가 부산의 인공지능 데이터센터 캠퍼스에 대규모 용량 계약을 맺었다고 두 회사가 밝혔다. ".repeat(8).trim();
