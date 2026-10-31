/**
 * generate — Phase 3d (news_brief). For every selected candidate the stage
 * builds a source packet from the raw item (title, body, date, rights), sends
 * it with the `prompts/news_brief.md` system prompt to the LLM adapter, and
 * validates the structured reply against `NewsBriefDraft`. The stage, never
 * the model, fills `source_url`, `source_name`, `published_at_source` and the
 * slug, so a draft cannot invent its source.
 *
 * Three deterministic checks are reported on every draft (brief 3d: "수치
 * grounding 검사 통과율 보고"); blocking is QA's job (3g):
 *   grounding        every number in the draft must appear in the source text
 *   quote_max_words  longest run of consecutive words shared with the source
 *   banned           no phrase, hook start or pattern from config/banned-phrases.yaml
 *
 * The system prompt is `prompts/news_brief.md` rendered with the same inventory
 * (`{{banned_phrases}}`), so the model is told what the guard enforces and the
 * prompt file never carries a copy of the list (AGENTS.md "Banned Generic Patterns").
 *
 * Each draft is upserted into `drafts` on (candidate_id, content_type,
 * prompt_version) with its usage and cost. A failed attempt is a dead letter
 * on the candidate; the run continues. The budget guard is consulted before
 * every call: when the next call cannot be covered the remaining candidates
 * are reported as budget_stopped (a first call that cannot be covered raises
 * BUDGET_EXCEEDED so the run ends as budget_stop).
 */
import { z } from "zod";
import { NewsBrief, NewsBriefDraft, candidateId, draftId, newsBriefSlug, rawItemId, renderTemplate, requireLlmPrompt } from "@cc/shared";
import type { CandidateInsert, DraftInsert, LlmResponse, RawItemInsert, SourceConfig, Stage, StageContext } from "@cc/shared";
import { estimateCostUsd } from "../adapters/llm/anthropic.ts";
import { BudgetExceededError } from "../budget.ts";
import { bannedPhraseCheck, bannedPhrasePromptText, compileBannedPhrases } from "../checks/banned-phrases.ts";
import type { GenerateDecision, GenerateStats } from "../state.ts";
import { bodyTextOf } from "./normalize.ts";
import { defineStageSpec } from "./spec.ts";
import { GenerateInput, GenerateOutput } from "./types.ts";

export const CONTENT_TYPE = "news_brief" as const;
export const SCHEMA_INVALID = "SCHEMA_INVALID";
const DECISION_SAMPLE = 100;
const UNGROUNDED_SAMPLE = 20;
const MAX_TAGS = 6;
const BANNED_SAMPLE = 20;

// ---------------------------------------------------------------------------
// deterministic checks
// ---------------------------------------------------------------------------
/**
 * A number with an optional scale: a run of Korean scale words (조/억/만/천, so `2천억` is 2 × 10³ × 10⁸),
 * one English word (trillion/billion/million/thousand, bn, mn, capitalised or not), or a currency-style
 * letter — upper-case `B`/`M`/`K` and lower-case `k` (`$45B`, `€5M`, `1.2K`, `10k`). Lower-case `b` and
 * `m` are not scales: `300 m` is a length, not 300 million (Codex PR #80). The letter must not start a
 * longer word, so `5MW`, `10GB` and `HBM3E` stay unscaled. The letters are case-sensitive, the words are
 * not (`BILLION` in a headline still scales), so the words are spelled as per-letter classes instead of
 * an `i` flag. Phase 4 shadow evidence: `$45B` in a source never met `450억` in the draft (compare.md §3).
 */
const anyCase = (word: string): string => [...word].map((char) => `[${char.toUpperCase()}${char.toLowerCase()}]`).join("");
const SCALE_WORDS = ["trillion", "billion", "bn", "million", "mn", "thousand"].map(anyCase).join("|");
const NUMBER = new RegExp(`(\\d+(?:[.,]\\d+)*)(?:\\s*(?:((?:조|억|만|천)+)|(${SCALE_WORDS}|[BMKk])(?![A-Za-z])))?`, "gu");
const SCALE: Record<string, number> = { 조: 1e12, 억: 1e8, 만: 1e4, 천: 1e3, trillion: 1e12, billion: 1e9, bn: 1e9, b: 1e9, million: 1e6, mn: 1e6, m: 1e6, thousand: 1e3, k: 1e3 };
/** Korean month digits (`7월`) ground on the English month name in the source (`July`): the source never carries the digit. */
const MONTH_SUFFIX = /^월(?!간)/u;
const MONTH_NAMES: Record<string, number> = { jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12 };
/**
 * Full month names stand on their own. `May` and the three-letter abbreviations are ordinary words too
 * ("construction may begin", "mar", "dec"), so they count only next to a day or a year: `3 May 2026`,
 * `May 30`, `Sept. 16`, `Sep 2026` (Codex PR #80).
 */
const MONTH_FULL = /\b(january|february|march|april|june|july|august|september|october|november|december)\b/giu;
const MONTH_SHORT = /(?:\b\d{1,2}(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)\b\.?)|(?:\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)\b\.?,?\s+\d{1,4}\b)/giu;

/** Month numbers (1–12) the source names in English, so a Korean `7월` claim can ground on "July". */
export function monthsNamed(text: string): Set<number> {
  const out = new Set<number>();
  for (const match of text.matchAll(MONTH_FULL)) out.add(MONTH_NAMES[match[1]!.toLowerCase()]!);
  for (const match of text.matchAll(MONTH_SHORT)) {
    const month = MONTH_NAMES[(match[1] ?? match[2])!.toLowerCase()];
    if (month !== undefined) out.add(month);
  }
  return out;
}

/** The multiplier a scale token stands for; a Korean run multiplies its characters. */
export function scaleMultiplier(scale: string | undefined): number {
  if (!scale) return 1;
  const lower = scale.toLowerCase();
  if (lower in SCALE) return SCALE[lower]!;
  let multiplier = 1;
  for (const char of scale) multiplier *= SCALE[char] ?? 1;
  return multiplier;
}

/**
 * Decimal-safe comparison key: the product is rounded to 12 significant digits so
 * `20.1억` and `2.01 billion` share "2010000000" instead of two floating-point tails.
 */
export function canonicalKey(value: number, multiplier: number): string {
  return String(Number((value * multiplier).toPrecision(12)));
}
/** Korean counters and ordinals right after a digit ("1단계", "2차", "3분기") count things, not figures; they are not grounded. */
const COUNTER = /^(?:단계|차|번째|호기|호|개|곳|명|건|번|위|층|분기|라운드|종|차례)/u;

export interface NumberClaim {
  /** As written, e.g. `21억` or `2.1 billion`. */
  raw: string;
  /** Canonical value with the scale applied, so `21억` and `2.1 billion` share a key. */
  key: string;
  /** True when a scale word was written (`21억`, `2.1 billion`): such a claim grounds only on the canonical value. */
  scaled: boolean;
  /** The bare number without its scale, so a source "2.1 billion" also grounds an unscaled draft "2.1". */
  bare: string;
  /** 1–12 when the claim is a Korean month (`7월`, raw keeps the suffix); such a claim also grounds on the English month name. */
  month: number | null;
}

/**
 * Numeric claims in a text, Korean-aware: thousands separators dropped, scale words applied, counters
 * skipped. A compound Korean numeral — scaled groups separated by whitespace with strictly falling scales,
 * `3억 600만` or `1조 2,000억` — is one claim worth their sum (Phase 4: the two halves of `3억 600만` never met
 * the source's "306 million"). `N월` with N in 1–12 is flagged as a month.
 */
export function numberClaims(text: string): NumberClaim[] {
  const out: NumberClaim[] = [];
  let open: { start: number; end: number; value: number; multiplier: number } | null = null;
  const close = (): void => {
    if (!open) return;
    const key = canonicalKey(open.value, 1);
    out.push({ raw: text.slice(open.start, open.end).trim(), key, scaled: true, bare: key, month: null });
    open = null;
  };
  for (const match of text.matchAll(NUMBER)) {
    const [raw, digits, ko, en] = match;
    const start = match.index ?? 0;
    const end = start + raw.length;
    const scale = ko ?? en?.toLowerCase();
    const after = text.slice(end);
    if (!scale && COUNTER.test(after)) {
      close();
      continue;
    }
    const bare = (digits ?? "").replace(/,(?=\d{3}(?:\D|$))/g, "");
    const value = Number.parseFloat(bare);
    if (!Number.isFinite(value)) {
      close();
      continue;
    }
    const multiplier = scaleMultiplier(scale);
    if (ko) {
      if (open && multiplier < open.multiplier && /^\s*$/u.test(text.slice(open.end, start))) {
        open = { start: open.start, end, value: open.value + value * multiplier, multiplier };
        continue;
      }
      close();
      open = { start, end, value: value * multiplier, multiplier };
      continue;
    }
    close();
    const month = !scale && /^\d+$/u.test(bare) && value >= 1 && value <= 12 && MONTH_SUFFIX.test(after) ? value : null;
    // A month claim is written `7월`, so it never shares its dedup identity with a bare `7` elsewhere in the draft (Codex PR #80).
    out.push({ raw: month === null ? raw.trim() : `${raw.trim()}월`, key: canonicalKey(value, multiplier), scaled: Boolean(scale), bare, month });
  }
  close();
  return out;
}

/** Numbers as written, for display. */
export function numberTokens(text: string): string[] {
  return numberClaims(text).map((claim) => claim.raw);
}

export interface GroundingResult {
  numbers: string[];
  ungrounded: string[];
  pass: boolean;
}

/**
 * Every number in the draft must appear in the source text by value (`21억 달러`
 * grounds on `$2.1 billion`; `1.2 GW` does not ground on `1,200 MW` — unit
 * conversion is left to the prompt's "keep the source's unit" rule). A claim
 * written with a scale word (`2.1 million`) must match the source's canonical
 * value, so `2.1 million` never grounds on `$2.1 billion`; only an unscaled
 * claim (`2.1`) may fall back to the digits of a scaled source figure. Numbers
 * only; entities are QA 3g's UNGROUNDED_ENTITY.
 */
export function groundingCheck(draftText: string, sourceText: string): GroundingResult {
  const source = new Set<string>();
  for (const claim of numberClaims(sourceText)) {
    source.add(claim.key);
    source.add(claim.bare);
  }
  const months = monthsNamed(sourceText);
  const seen = new Set<string>();
  const numbers: string[] = [];
  const ungrounded: string[] = [];
  for (const claim of numberClaims(draftText)) {
    if (seen.has(claim.raw)) continue;
    seen.add(claim.raw);
    numbers.push(claim.raw);
    const grounded = claim.scaled ? source.has(claim.key) : source.has(claim.key) || source.has(claim.bare) || (claim.month !== null && months.has(claim.month));
    if (!grounded) ungrounded.push(claim.raw);
  }
  return { numbers, ungrounded, pass: ungrounded.length === 0 };
}

function words(text: string): string[] {
  return text.toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}'’.-]*/gu) ?? [];
}

/** Longest run of consecutive words two texts share (the continuous-quote measure QA caps at 20). */
export function longestCommonRun(a: string, b: string): number {
  const x = words(a);
  const y = words(b);
  if (x.length === 0 || y.length === 0) return 0;
  let best = 0;
  let previous = new Array<number>(y.length + 1).fill(0);
  for (let i = 1; i <= x.length; i += 1) {
    const current = new Array<number>(y.length + 1).fill(0);
    for (let j = 1; j <= y.length; j += 1) {
      if (x[i - 1] === y[j - 1]) {
        current[j] = (previous[j - 1] ?? 0) + 1;
        if ((current[j] ?? 0) > best) best = current[j] ?? 0;
      }
    }
    previous = current;
  }
  return best;
}

/** The reader-facing fields the banned-phrase guard reads. */
export function readerFields(brief: NewsBriefDraft): Record<string, string> {
  return { title_ko: brief.title_ko, summary_ko: brief.summary_ko, why_it_matters_ko: brief.why_it_matters_ko, expert_lens_ko: brief.expert_lens_ko };
}

// ---------------------------------------------------------------------------
// the request
// ---------------------------------------------------------------------------
export interface SourcePacket {
  title: string;
  source_name: string;
  source_url: string;
  published_at: string | null;
  language: string | null;
  text_rights: string;
  text_scope: string;
  body_chars: number;
  body_text: string;
  note: string;
}

export function sourcePacket(item: RawItemInsert, source: SourceConfig | undefined, maxChars: number): SourcePacket {
  const body = bodyTextOf(item);
  const rights = source?.text_rights ?? "link_only";
  const scope = source?.text_scope ?? "full";
  const truncated = body.length > maxChars ? `${body.slice(0, maxChars)} […]` : body;
  const notes: string[] = [];
  if (rights === "link_only") notes.push("이 소스는 제목과 짧은 요약만 쓸 수 있다. 아는 범위만 짧게 쓴다.");
  if (scope === "abstract") notes.push("본문은 초록(abstract)뿐이다. 초록이 말한 범위를 넘지 않는다.");
  if (body.length > maxChars) notes.push(`본문은 ${maxChars}자에서 잘렸다.`);
  if (body.length === 0) notes.push("본문이 없다. 제목만으로 알 수 있는 사실만 쓴다.");
  return {
    title: item.title,
    source_name: source?.name ?? item.source_id,
    source_url: item.canonical_url,
    published_at: item.published_at_source ?? null,
    language: source?.language ?? null,
    text_rights: rights,
    text_scope: scope,
    body_chars: body.length,
    body_text: truncated,
    note: notes.join(" ") || "본문 전체를 쓸 수 있다.",
  };
}

export function userMessage(packet: SourcePacket): string {
  return `원문 패킷:\n${JSON.stringify(packet, null, 2)}`;
}

/** Text the checks compare the draft against: title, body, source name and the publication date. */
export function sourceTextOf(item: RawItemInsert, source: SourceConfig | undefined): string {
  return [item.title, bodyTextOf(item), source?.name ?? "", item.published_at_source ?? ""].join("\n");
}

function stripFences(text: string): string {
  const trimmed = text.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  return fenced?.[1] ?? trimmed;
}

/** The model's reply as a validated draft; throws SCHEMA_INVALID with the zod issues. */
export function parseDraft(response: LlmResponse): NewsBriefDraft {
  let raw: unknown = response.json;
  if (raw === undefined) {
    try {
      raw = JSON.parse(stripFences(response.text));
    } catch {
      throw new Error(`${SCHEMA_INVALID}: reply is not JSON (${response.text.length} chars, stop_reason ${response.stopReason})`);
    }
  }
  if (raw && typeof raw === "object" && Array.isArray((raw as { tags?: unknown }).tags)) {
    const tags = [...new Set(((raw as { tags: unknown[] }).tags).filter((t): t is string => typeof t === "string").map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(0, MAX_TAGS);
    raw = { ...(raw as object), tags };
  }
  const result = NewsBriefDraft.safeParse(raw);
  if (!result.success) throw new Error(`${SCHEMA_INVALID}: ${result.error.issues.map((issue) => `${issue.path.join(".") || "<root>"}: ${issue.message}`).join("; ")}`);
  return result.data;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export const generateStage: Stage<GenerateInput, GenerateOutput> = {
  name: "generate",
  input: GenerateInput,
  output: GenerateOutput,
  idempotencyKey: (input) => `generate:${input.selected.map((candidate) => candidate.id ?? candidate.raw_item_id).sort().join("|")}`,
  async run(input, ctx: StageContext) {
    const started = Date.now();
    const llmConfig = ctx.config.llm;
    const model = llmConfig.models.news_brief;
    const prompt = requireLlmPrompt(await ctx.adapters.prompts.get("news_brief"));
    const banned = compileBannedPhrases(ctx.bannedPhrases);
    /** `{{banned_phrases}}` is the only placeholder; an unresolved one fails here, never at the model. */
    const system = renderTemplate(prompt.system, { banned_phrases: bannedPhrasePromptText(ctx.bannedPhrases) });
    const outputSchema = z.toJSONSchema(NewsBriefDraft) as Record<string, unknown>;
    const sources = new Map(input.sources.map((source) => [source.id, source]));
    const items = new Map(input.rawItems.map((item) => [item.id ?? rawItemId(item.canonical_url), item]));

    const drafts: DraftInsert[] = [];
    const decisions: GenerateDecision[] = [];
    let failed = 0;
    let budgetStopped = 0;
    let costUsd = 0;
    let inputTokens = 0;
    let outputTokens = 0;
    let groundingChecked = 0;
    let groundingPassed = 0;
    let groundingNumbers = 0;
    let groundingUngrounded = 0;
    let quoteMax = 0;
    let bannedChecked = 0;
    let bannedPassed = 0;
    let bannedMatches = 0;

    const record = (decision: GenerateDecision): void => {
      if (decisions.length < DECISION_SAMPLE) decisions.push(decision);
    };

    for (const [index, candidate] of input.selected.entries()) {
      const item = items.get(candidate.raw_item_id);
      if (!item) throw new Error(`generate: no raw item for candidate ${candidate.raw_item_id}`);
      const source = sources.get(item.source_id);
      const candidateRowId = candidate.id ?? candidateId(candidate.raw_item_id, candidate.rubric_version);
      const packet = sourcePacket(item, source, llmConfig.max_source_chars);
      const message = userMessage(packet);
      const estimate = estimateCostUsd(system.length + message.length, prompt.max_output_tokens, llmConfig.pricing[model]);
      if (!ctx.budget.canSpend(estimate)) {
        if (drafts.length === 0 && index === 0) throw new BudgetExceededError(ctx.budget.spentUsd, ctx.budget.limitUsd);
        budgetStopped = input.selected.length - index;
        ctx.budget.stop(`generate stopped before candidate ${index + 1}/${input.selected.length}: next call estimated at USD ${estimate.toFixed(4)}, spent ${ctx.budget.spentUsd.toFixed(4)} of cap ${ctx.budget.limitUsd.toFixed(2)} after ${ctx.budget.calls} calls`);
        ctx.logger.warn("generate: budget cannot cover the next call; stopping (run ends as budget_stop, drafts so far are kept)", { remaining: budgetStopped, estimate_usd: estimate, spent_usd: ctx.budget.spentUsd, cap_usd: ctx.budget.limitUsd });
        for (const rest of input.selected.slice(index)) {
          const restItem = items.get(rest.raw_item_id);
          record({ canonical_url: restItem?.canonical_url ?? rest.raw_item_id, source_id: restItem?.source_id ?? "", slug: null, ok: false, error: `BUDGET_EXCEEDED: next call estimated at USD ${estimate.toFixed(4)} would pass the cap`, model: null, cost_usd: 0, input_tokens: 0, output_tokens: 0, grounding_numbers: 0, grounding_ungrounded: [], quote_max_words: 0, banned_matches: [], title_ko: null });
        }
        break;
      }

      let response: LlmResponse;
      try {
        response = await ctx.adapters.llm.complete(
          { task: "news_brief", model, system, messages: [{ role: "user", content: message }], outputSchema, maxOutputTokens: prompt.max_output_tokens, promptVersion: prompt.version, cacheKey: candidate.raw_item_id },
          ctx,
        );
      } catch (error) {
        if (error instanceof BudgetExceededError) throw error;
        failed += 1;
        const text = errorText(error);
        await ctx.ledger.deadLetter({ run_id: ctx.runId, stage: "generate", ref_table: "candidates", ref_id: candidateRowId, payload: { canonical_url: item.canonical_url, source_id: item.source_id, model, prompt_version: prompt.version }, error: text });
        record({ canonical_url: item.canonical_url, source_id: item.source_id, slug: null, ok: false, error: text, model, cost_usd: 0, input_tokens: 0, output_tokens: 0, grounding_numbers: 0, grounding_ungrounded: [], quote_max_words: 0, banned_matches: [], title_ko: null });
        ctx.logger.error("generate: llm call failed", { source_id: item.source_id, url: item.canonical_url, error: text });
        continue;
      }
      costUsd += response.costUsd;
      inputTokens += response.usage.inputTokens;
      outputTokens += response.usage.outputTokens;

      let draft: NewsBriefDraft;
      try {
        draft = parseDraft(response);
      } catch (error) {
        failed += 1;
        const text = errorText(error);
        await ctx.ledger.deadLetter({ run_id: ctx.runId, stage: "generate", ref_table: "candidates", ref_id: candidateRowId, payload: { canonical_url: item.canonical_url, source_id: item.source_id, model: response.model, prompt_version: prompt.version, stop_reason: response.stopReason, reply_chars: response.text.length }, error: text });
        record({ canonical_url: item.canonical_url, source_id: item.source_id, slug: null, ok: false, error: text, model: response.model, cost_usd: response.costUsd, input_tokens: response.usage.inputTokens, output_tokens: response.usage.outputTokens, grounding_numbers: 0, grounding_ungrounded: [], quote_max_words: 0, banned_matches: [], title_ko: null });
        ctx.logger.error("generate: reply failed the draft schema", { source_id: item.source_id, url: item.canonical_url, error: text });
        continue;
      }

      const brief = NewsBrief.parse({
        ...draft,
        source_url: item.canonical_url,
        source_name: source?.name ?? item.source_id,
        published_at_source: item.published_at_source ?? item.fetched_at,
        slug: newsBriefSlug(item.canonical_url, item.title),
      });
      const sourceText = sourceTextOf(item, source);
      const draftText = [brief.title_ko, brief.summary_ko, brief.why_it_matters_ko, brief.expert_lens_ko].join("\n");
      const grounding = groundingCheck(draftText, sourceText);
      const quoteWords = longestCommonRun(draftText, sourceText);
      groundingChecked += 1;
      if (grounding.pass) groundingPassed += 1;
      groundingNumbers += grounding.numbers.length;
      groundingUngrounded += grounding.ungrounded.length;
      quoteMax = Math.max(quoteMax, quoteWords);
      const bannedResult = bannedPhraseCheck(readerFields(brief), banned);
      bannedChecked += 1;
      if (bannedResult.pass) bannedPassed += 1;
      bannedMatches += bannedResult.matches.length;

      const row: DraftInsert = {
        id: draftId(candidateRowId, CONTENT_TYPE, prompt.version),
        candidate_id: candidateRowId,
        run_id: ctx.runId,
        content_type: CONTENT_TYPE,
        prompt_version: prompt.version,
        model: response.model,
        body: {
          brief,
          checks: { grounding: { numbers: grounding.numbers, ungrounded: grounding.ungrounded, pass: grounding.pass }, quote_max_words: quoteWords, banned: { version: bannedResult.version, matches: bannedResult.matches, pass: bannedResult.pass } },
          source: { raw_item_id: candidate.raw_item_id, canonical_url: item.canonical_url, source_id: item.source_id, text_rights: packet.text_rights, text_scope: packet.text_scope, chars: packet.body_chars },
        },
        input_tokens: response.usage.inputTokens,
        output_tokens: response.usage.outputTokens,
        cost_usd: response.costUsd,
        review_status: "none",
      };
      drafts.push(row);
      record({ canonical_url: item.canonical_url, source_id: item.source_id, slug: brief.slug, ok: true, error: null, model: response.model, cost_usd: response.costUsd, input_tokens: response.usage.inputTokens, output_tokens: response.usage.outputTokens, grounding_numbers: grounding.numbers.length, grounding_ungrounded: grounding.ungrounded.slice(0, UNGROUNDED_SAMPLE), quote_max_words: quoteWords, banned_matches: bannedResult.matches.slice(0, BANNED_SAMPLE), title_ko: brief.title_ko });
      ctx.logger.info("generate: draft written", { source_id: item.source_id, url: item.canonical_url, slug: brief.slug, model: response.model, cost_usd: response.costUsd, grounding_pass: grounding.pass, ungrounded: grounding.ungrounded, quote_max_words: quoteWords, banned_matches: bannedResult.matches });
    }

    if (drafts.length > 0) await ctx.adapters.db.upsert("drafts", drafts as unknown as Record<string, unknown>[], ["candidate_id", "content_type", "prompt_version"]);
    const stats: GenerateStats = {
      selected: input.selected.length,
      drafted: drafts.length,
      failed,
      budget_stopped: budgetStopped,
      cost_usd: Number(costUsd.toFixed(6)),
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      grounding: { checked: groundingChecked, passed: groundingPassed, numbers: groundingNumbers, ungrounded: groundingUngrounded },
      grounding_pass_rate: groundingChecked > 0 ? Number((groundingPassed / groundingChecked).toFixed(3)) : null,
      quote_max_words: quoteMax,
      banned: { checked: bannedChecked, passed: bannedPassed, matches: bannedMatches },
      decisions,
      ms: Date.now() - started,
    };
    ctx.logger.info("generate: finished", { selected: stats.selected, drafted: stats.drafted, failed: stats.failed, budget_stopped: stats.budget_stopped, cost_usd: stats.cost_usd, grounding_pass_rate: stats.grounding_pass_rate, quote_max_words: stats.quote_max_words, banned: stats.banned, prompt_version: prompt.version, banned_phrases_version: banned.version, model });
    return { drafts, stats };
  },
};

export const generateSpec = defineStageSpec({
  stage: generateStage,
  select: (state) => ({ selected: state.selected, rawItems: state.rawItems, sources: state.sources }),
  merge: (state, output) => ({ ...state, drafts: output.drafts, generateStats: output.stats }),
  counts: (output) => ({
    selected: output.stats.selected,
    drafted: output.stats.drafted,
    failed: output.stats.failed,
    budget_stopped: output.stats.budget_stopped,
    grounding_checked: output.stats.grounding.checked,
    grounding_passed: output.stats.grounding.passed,
    quote_max_words: output.stats.quote_max_words,
    banned_passed: output.stats.banned.passed,
    cost_usd_milli: Math.round(output.stats.cost_usd * 1000),
  }),
});
