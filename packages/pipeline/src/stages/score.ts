/**
 * score — Phase 3c. Scores every candidate on the five-axis rubric
 * (relevance, timeliness, impact, reader_value, insight_potential), stores the
 * per-axis score and a one-line reason for each, applies the tier thresholds
 * and selects the cycle's briefs. Deterministic and LLM-free (R7); every
 * number, vocabulary and pattern comes from `config/scoring.yaml`
 * (`ctx.scoring`), so tuning is a config change (brief 3c).
 *
 *   total   = Σ weights[axis] × score[axis]
 *   tier    = relevance < thresholds.relevance_min → BELOW_THRESHOLD (whatever the total) ·
 *             total ≥ thresholds.full → full · ≥ thresholds.brief → brief · else BELOW_THRESHOLD
 *   select  = passing candidates by total (then timeliness, then url), at most
 *             `selection.per_source_max` per source and `caps.briefs_per_cycle.max`
 *             in all; the rest are NOT_SELECTED with their rank. Fewer passing
 *             candidates than `caps.briefs_per_cycle.min` is reported as a
 *             shortfall, never filled from below the threshold.
 *
 * Every candidate is upserted into `candidates` (raw_item_id + rubric_version =
 * score/<version>) with `scores`, `total`, `selected`, `reject_reason` and
 * `rubric { tier, rank, insight_eligible, reasons }` (ADR-003, R6).
 */
import { RELEVANCE_DIMENSIONS, candidateId, rawItemId } from "@cc/shared";
import type {
  CandidateInsert,
  CandidateReasons,
  CandidateTier,
  ImpactConfig,
  InsightPotentialConfig,
  RawItemInsert,
  ReaderValueConfig,
  RelevanceConfig,
  RelevanceDimension,
  Row,
  RubricScores,
  ScoringConfig,
  SourceConfig,
  Stage,
  StageContext,
  TimelinessConfig,
  WeightedTerm,
} from "@cc/shared";
import type { ScoreDecision, ScoreStats } from "../state.ts";
import { bodyTextOf } from "./normalize.ts";
import { defineStageSpec } from "./spec.ts";
import { ScoreInput, ScoreOutput } from "./types.ts";

export const BELOW_THRESHOLD = "BELOW_THRESHOLD";
export const NOT_SELECTED = "NOT_SELECTED";
const DECISION_SAMPLE = 100;
const UPSERT_CHUNK = 50;
const REASON_TERMS = 3;

export function rubricVersion(version: string): string {
  return `score/${version}`;
}

/** `<CODE>: <key>=<value>,<key>=<value>` — the code is first so `errorCode()`-style parsing recovers it (R6). */
export function rejectReason(code: string, detail: Record<string, string | number>): string {
  return `${code}: ${Object.entries(detail).map(([key, value]) => `${key}=${value}`).join(",")}`;
}

function round3(value: number): number {
  return Number(value.toFixed(3));
}

function chunks<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += 1) if (i % size === 0) out.push(items.slice(i, i + size));
  return out;
}

// ---------------------------------------------------------------------------
// text normalisation and term matching
// ---------------------------------------------------------------------------
const WORD_CHAR = "a-z0-9가-힣";

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Same rewrite the vocabulary gets: lower case, `&` → and, one space between words. */
function normalizeTerm(term: string): string {
  return term.toLowerCase().replace(/&/g, " and ").replace(/\s+/g, " ").trim();
}

const termPatterns = new Map<string, RegExp>();

/** Whole-word, case-insensitive match; whitespace inside a multi-word term is flexible. */
export function termPattern(term: string): RegExp {
  const key = normalizeTerm(term);
  let pattern = termPatterns.get(key);
  if (!pattern) {
    pattern = new RegExp(`(?<![${WORD_CHAR}])${escapeRegex(key).replace(/ /g, "\\s+")}(?![${WORD_CHAR}])`, "iu");
    termPatterns.set(key, pattern);
  }
  return pattern;
}

export function hasTerm(text: string, term: string): boolean {
  return termPattern(term).test(text);
}

export function anyTerm(text: string, terms: readonly string[]): boolean {
  return terms.some((term) => hasTerm(text, term));
}

export function matchedTerms(text: string, terms: readonly string[]): string[] {
  return terms.filter((term) => hasTerm(text, term));
}

interface Alias {
  pattern: RegExp;
  to: string;
}

/** A Hangul phrase matches with or without spaces between its syllables; a Latin phrase keeps word boundaries. */
function aliasPattern(from: string): RegExp {
  if (/[가-힣]/u.test(from)) return new RegExp([...from.replace(/\s+/g, "")].map(escapeRegex).join("\\s*"), "giu");
  return new RegExp(`(?<![a-z0-9])${escapeRegex(from.toLowerCase()).replace(/\s+/g, "\\s*")}(?![a-z0-9])`, "giu");
}

/** Lower case, Korean aliases rewritten to the English vocabulary, `&` → and, punctuation collapsed to spaces (`$ % . - / + #` kept for figures). */
export function normalizeText(value: string, aliases: readonly Alias[]): string {
  let text = value.toLowerCase();
  for (const alias of aliases) text = text.replace(alias.pattern, ` ${alias.to} `);
  return text
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9.+#/$%€£₩가-힣-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ---------------------------------------------------------------------------
// compiled config (patterns are compiled once per run)
// ---------------------------------------------------------------------------
interface CompiledSignal {
  id: string;
  weight: number;
  terms: readonly string[] | null;
  pattern: RegExp | null;
}

export interface CompiledScoring {
  aliases: Alias[];
  speculativeMarket: RegExp;
  physicalInfra: RegExp;
  hardArchiveException: RegExp;
  noticeTitle: RegExp[];
  noticeBody: RegExp[];
  computeContext: RegExp[];
  signals: CompiledSignal[];
  figures: RegExp;
}

export function compileScoring(cfg: ScoringConfig): CompiledScoring {
  const re = (source: string): RegExp => new RegExp(source, "iu");
  return {
    aliases: cfg.relevance.korean.aliases.map((alias) => ({ pattern: aliasPattern(alias.from), to: normalizeTerm(alias.to) })),
    speculativeMarket: re(cfg.relevance.korean.speculative_market_pattern),
    physicalInfra: re(cfg.relevance.korean.physical_infra_pattern),
    hardArchiveException: new RegExp(cfg.relevance.hard_archive_exception_pattern, "giu"),
    noticeTitle: cfg.relevance.procedural_notice.title_patterns.map(re),
    noticeBody: cfg.relevance.procedural_notice.body_patterns.map(re),
    computeContext: cfg.relevance.procedural_notice.compute_context_patterns.map(re),
    signals: cfg.impact.signals.map((signal) => ({ id: signal.id, weight: signal.weight, terms: signal.terms ?? null, pattern: signal.pattern ? re(signal.pattern) : null })),
    figures: re(cfg.reader_value.figures.pattern),
  };
}

// ---------------------------------------------------------------------------
// the document a candidate is scored on
// ---------------------------------------------------------------------------
export interface ScoreDoc {
  candidate: CandidateInsert;
  item: RawItemInsert;
  source: SourceConfig | undefined;
  /** Raw source text, untouched (Korean market patterns run on it). */
  raw: string;
  /** Normalised title. */
  title: string;
  /** Normalised title + body. */
  text: string;
  /** Longest stored body text (extracted body, preview, snippet or description). */
  body: string;
  /**
   * Full-rights source without a positive extraction: `failed` (ingest kept the feed text with
   * `payload.extraction.ok = false`) or `missing` (never attempted: extract_bodies off, extract.kind
   * none, no extractor). null when the page text is there (`ok: true`) or the source is not full-rights.
   */
  unextracted: "failed" | "missing" | null;
}

export function unextracted(item: RawItemInsert, source: SourceConfig | undefined): "failed" | "missing" | null {
  if (source?.text_rights !== "full") return null;
  const marker = item.payload?.["extraction"];
  const ok = typeof marker === "object" && marker !== null ? (marker as { ok?: unknown }).ok : undefined;
  if (ok === true) return null;
  return ok === false ? "failed" : "missing";
}

export function scoreDoc(candidate: CandidateInsert, item: RawItemInsert, source: SourceConfig | undefined, compiled: CompiledScoring): ScoreDoc {
  const body = bodyTextOf(item);
  const raw = `${item.title} ${body}`;
  return { candidate, item, source, raw, title: normalizeText(item.title, compiled.aliases), text: normalizeText(raw, compiled.aliases), body, unextracted: unextracted(item, source) };
}

// ---------------------------------------------------------------------------
// relevance (the legacy eight-dimension classifier as data)
// ---------------------------------------------------------------------------
export interface TermScore {
  score: number;
  matched: string[];
}

export function scoreTerms(text: string, title: string, terms: readonly WeightedTerm[], titleBoost: number, termCap: number): TermScore {
  let score = 0;
  const matched: string[] = [];
  for (const [term, weight] of terms) {
    if (!hasTerm(text, term)) continue;
    const boost = hasTerm(title, term) ? titleBoost : 0;
    score += Math.min(termCap, weight * (1 + boost));
    matched.push(term);
  }
  return { score: Math.min(1, round3(score)), matched };
}

function hostOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** A docket source's formulaic notice with no compute hook (hydro relicensing, EIS availability, combined filings...). */
export function isProceduralNotice(doc: ScoreDoc, cfg: RelevanceConfig["procedural_notice"], compiled: CompiledScoring): boolean {
  const hosts = [hostOf(doc.item.canonical_url), hostOf(doc.source?.url)].filter((host): host is string => host !== null);
  const docket =
    cfg.source_id_prefixes.some((prefix) => doc.item.source_id.startsWith(prefix)) ||
    hosts.some((host) => cfg.hosts.some((docketHost) => host === docketHost || host.endsWith(`.${docketHost}`)));
  if (!docket) return false;
  const formulaic = compiled.noticeTitle.some((pattern) => pattern.test(doc.title)) || compiled.noticeBody.some((pattern) => pattern.test(doc.text));
  if (!formulaic) return false;
  return !(anyTerm(doc.text, cfg.compute_context_terms) || compiled.computeContext.some((pattern) => pattern.test(doc.text)));
}

export interface RelevanceResult {
  score: number;
  dimensions: Record<RelevanceDimension, number>;
  reason: string;
}

export function scoreRelevance(doc: ScoreDoc, cfg: RelevanceConfig, compiled: CompiledScoring): RelevanceResult {
  const { text, title } = doc;
  const dims = {} as Record<RelevanceDimension, number>;
  const matched = {} as Record<RelevanceDimension, string[]>;
  for (const key of RELEVANCE_DIMENSIONS) {
    const result = scoreTerms(text, title, cfg.dimensions[key], cfg.title_boost, cfg.term_cap);
    dims[key] = result.score;
    matched[key] = result.matched;
  }

  const hasAi = anyTerm(text, cfg.ai_terms);
  const hasInfra = anyTerm(text, cfg.infra_terms);
  const consumerOnly = hasAi && !hasInfra && anyTerm(text, cfg.consumer_ai_terms);
  const weakAdjacent = hasAi && anyTerm(text, cfg.weak_ai_adjacent_terms);
  const hardArchive = anyTerm(text.replace(compiled.hardArchiveException, " power generation "), cfg.hard_archive_terms);
  const adjacentOnly = anyTerm(text, cfg.adjacent_only_terms);
  const procedural = isProceduralNotice(doc, cfg.procedural_notice, compiled);
  const marketChatter = compiled.speculativeMarket.test(doc.raw) && !compiled.physicalInfra.test(doc.raw);

  // Lifts raise the direct-AI-infrastructure dimension when AI meets physical capacity.
  const lifts: string[] = [];
  const L = cfg.lifts;
  const raise = (floor: number, name: string): void => {
    if (dims.direct_ai_infrastructure < floor) {
      dims.direct_ai_infrastructure = floor;
      lifts.push(name);
    }
  };
  if (hasAi && hasInfra) {
    dims.direct_ai_infrastructure = Math.min(1, round3(dims.direct_ai_infrastructure + L.ai_and_infra_add));
    lifts.push("ai+infra");
  }
  if (hasAi && dims.data_center >= L.ai_and_data_center.min) raise(L.ai_and_data_center.floor, "ai+data_center");
  if (hasAi && dims.power_grid >= L.ai_and_grid_and_data_center.grid_min && dims.data_center >= L.ai_and_grid_and_data_center.data_center_min) raise(L.ai_and_grid_and_data_center.floor, "ai+grid+data_center");
  if (dims.data_center >= L.data_center_and_grid.min && dims.power_grid >= L.data_center_and_grid.min) raise(L.data_center_and_grid.floor, "data_center+grid");
  if (hasAi && dims.cloud_capacity >= L.ai_and_cloud.min) raise(L.ai_and_cloud.floor, "ai+cloud");

  const caps: string[] = [];
  if (consumerOnly && dims.direct_ai_infrastructure > L.consumer_ai_only_cap) {
    dims.direct_ai_infrastructure = L.consumer_ai_only_cap;
    caps.push("consumer_ai_only");
  }

  const F = cfg.formula;
  const sorted = RELEVANCE_DIMENSIONS.map((key) => dims[key]).sort((a, b) => b - a);
  const breadth = RELEVANCE_DIMENSIONS.filter((key) => dims[key] >= F.breadth_min).length;
  const breadthBoost = Math.min(F.breadth_max, breadth * F.breadth_step);
  const directBonus = dims.direct_ai_infrastructure >= F.direct_bonus_min ? F.direct_bonus : 0;
  let overall = Math.min(1, (sorted[0] ?? 0) * F.top + (sorted[1] ?? 0) * F.second + breadthBoost + directBonus);

  // A cap is listed whenever its condition holds (so the reason explains the story) and binds only when it lowers the score.
  const C = cfg.caps;
  const cap = (limit: number, name: string): void => {
    caps.push(`${name}(${limit})`);
    overall = Math.min(overall, limit);
  };
  const physical: RelevanceDimension[] = ["data_center", "cloud_capacity", "semiconductor", "power_grid", "cooling", "capital_markets"];
  const physicalTop = Math.max(...physical.map((key) => dims[key]));
  if (dims.enterprise_ai >= C.enterprise_only.enterprise_min && dims.direct_ai_infrastructure < C.enterprise_only.direct_max && physicalTop < C.enterprise_only.physical_max) cap(C.enterprise_only.cap, "enterprise_only");
  if (weakAdjacent && dims.direct_ai_infrastructure < C.weak_ai_adjacent.direct_max && physicalTop < C.weak_ai_adjacent.physical_max) cap(C.weak_ai_adjacent.cap, "weak_ai_adjacent");
  if (!hasInfra) cap(hasAi ? C.no_infra.with_ai : C.no_infra.without_ai, "no_infra");
  if (marketChatter) cap(C.korean_market_chatter, "korean_market_chatter");
  if (hardArchive) cap(C.hard_archive, "hard_archive");
  else if (adjacentOnly) cap(C.adjacent_only, "adjacent_only");
  if (procedural) cap(C.procedural_notice, "procedural_notice");

  const strongest = RELEVANCE_DIMENSIONS.filter((key) => dims[key] >= F.breadth_min)
    .sort((a, b) => dims[b] - dims[a])
    .map((key) => `${key}:${dims[key].toFixed(2)}${matched[key].length ? `(${matched[key].slice(0, REASON_TERMS).join("/")})` : ""}`);
  const reason = [`dims=${strongest.length ? strongest.join(" ") : "none"}`, lifts.length ? `lifts=${lifts.join("+")}` : null, caps.length ? `caps=${caps.join("+")}` : null].filter(Boolean).join("; ");
  return { score: round3(overall), dimensions: dims, reason };
}

// ---------------------------------------------------------------------------
// timeliness, impact, reader_value, insight_potential
// ---------------------------------------------------------------------------
export interface AxisResult {
  score: number;
  reason: string;
}

export function scoreTimeliness(publishedAt: string | null | undefined, now: Date, cfg: TimelinessConfig): AxisResult {
  const ms = publishedAt ? Date.parse(publishedAt) : Number.NaN;
  if (!Number.isFinite(ms)) return { score: cfg.unknown_date, reason: "date=unknown" };
  const ageHours = Math.max(0, (now.getTime() - ms) / 3_600_000);
  const age = `age=${ageHours.toFixed(1)}h`;
  for (const bucket of cfg.buckets) if (ageHours <= bucket.max_hours) return { score: bucket.score, reason: `${age},bucket=<=${bucket.max_hours}h` };
  return { score: cfg.beyond, reason: `${age},bucket=beyond` };
}

export function scoreImpact(doc: ScoreDoc, cfg: ImpactConfig, compiled: CompiledScoring): AxisResult {
  let score = 0;
  const hits: string[] = [];
  for (const signal of compiled.signals) {
    let hit: string | null = null;
    let inTitle = false;
    if (signal.terms) {
      hit = signal.terms.find((term) => hasTerm(doc.text, term)) ?? null;
      inTitle = hit !== null && hasTerm(doc.title, hit);
    } else if (signal.pattern) {
      hit = signal.pattern.exec(doc.text)?.[0] ?? null;
      inTitle = hit !== null && signal.pattern.test(doc.title);
    }
    if (hit === null) continue;
    score += signal.weight * (1 + (inTitle ? cfg.title_boost : 0));
    hits.push(`${signal.id}(${hit.trim()})`);
  }
  return { score: Math.min(1, round3(score)), reason: hits.length ? `signals=${hits.join(",")}` : "signals=none" };
}

export function scoreReaderValue(doc: ScoreDoc, cfg: ReaderValueConfig, compiled: CompiledScoring): AxisResult {
  const declared = doc.source?.text_rights ?? "link_only";
  // Without a positive extraction only feed text exists, so the item is worth what a rewrite_only source is worth.
  const rights = doc.unextracted ? "rewrite_only" : declared;
  const tier = String(doc.source?.tier ?? 3) as "1" | "2" | "3";
  const parts: string[] = [];
  let score = cfg.text_rights[rights] + cfg.tier[tier];
  parts.push(doc.unextracted ? `rights=${declared}→${rights}(extraction_${doc.unextracted},+${cfg.text_rights[rights]})` : `rights=${rights}(+${cfg.text_rights[rights]})`, `tier=${tier}(+${cfg.tier[tier]})`);
  const chars = doc.body.length;
  if (chars >= cfg.body.min_chars) {
    score += cfg.body.weight;
    parts.push(`body=${chars}ch(+${cfg.body.weight})`);
  } else parts.push(`body=${chars}ch`);
  const region = matchedTerms(doc.text, cfg.region.terms).slice(0, REASON_TERMS);
  if (region.length) {
    score += cfg.region.weight;
    parts.push(`region=${region.join("/")}(+${cfg.region.weight})`);
  }
  if (compiled.figures.test(doc.text)) {
    score += cfg.figures.weight;
    parts.push(`figures(+${cfg.figures.weight})`);
  }
  score = Math.min(1, round3(score));
  if (doc.source?.text_scope === "abstract" && score > cfg.abstract_cap) {
    score = cfg.abstract_cap;
    parts.push(`cap=abstract(${cfg.abstract_cap})`);
  }
  return { score, reason: parts.join(",") };
}

export function scoreInsightPotential(doc: ScoreDoc, cfg: InsightPotentialConfig, dimensions: Record<RelevanceDimension, number>): AxisResult {
  let score = 0;
  const hits: string[] = [];
  for (const theme of cfg.themes) {
    const terms = matchedTerms(doc.text, theme.terms);
    if (terms.length === 0) continue;
    const inTitle = terms.some((term) => hasTerm(doc.title, term));
    score += theme.weight * (1 + (inTitle ? cfg.title_boost : 0));
    hits.push(`${theme.id}(${terms.slice(0, 2).join("/")})`);
  }
  const breadth = RELEVANCE_DIMENSIONS.filter((key) => dimensions[key] >= cfg.breadth.min_score).length;
  const parts = [`themes=${hits.length ? hits.join(",") : "none"}`];
  if (breadth >= cfg.breadth.min_dimensions) {
    score += cfg.breadth.bonus;
    parts.push(`breadth=${breadth}dims(+${cfg.breadth.bonus})`);
  }
  return { score: Math.min(1, round3(score)), reason: parts.join(";") };
}

// ---------------------------------------------------------------------------
// the rubric
// ---------------------------------------------------------------------------
export interface Scored {
  doc: ScoreDoc;
  scores: RubricScores;
  reasons: CandidateReasons;
  total: number;
  /** null: below the brief threshold. */
  tier: CandidateTier | null;
  insightEligible: boolean;
}

/**
 * Tier from the total and the relevance floor, then the caps. The abstract-scope cap is config
 * (`selection.abstract_max_tier`); the unextracted cap is not: a full-rights item without a positive
 * extraction marker never reaches `full`, whatever the config says (fail-closed, AGENTS.md: no
 * long-form from an unverified source).
 */
export function tierOf(total: number, relevance: number, cfg: ScoringConfig, source: SourceConfig | undefined, unextractedItem = false): CandidateTier | null {
  if (relevance < cfg.thresholds.relevance_min) return null;
  const uncapped: CandidateTier | null = total >= cfg.thresholds.full ? "full" : total >= cfg.thresholds.brief ? "brief" : null;
  if (uncapped !== "full") return uncapped;
  if (unextractedItem) return "brief";
  return source?.text_scope === "abstract" && cfg.selection.abstract_max_tier === "brief" ? "brief" : "full";
}

export function scoreCandidate(doc: ScoreDoc, cfg: ScoringConfig, compiled: CompiledScoring, now: Date): Scored {
  const relevance = scoreRelevance(doc, cfg.relevance, compiled);
  const timeliness = scoreTimeliness(doc.item.published_at_source, now, cfg.timeliness);
  const impact = scoreImpact(doc, cfg.impact, compiled);
  const readerValue = scoreReaderValue(doc, cfg.reader_value, compiled);
  const insight = scoreInsightPotential(doc, cfg.insight_potential, relevance.dimensions);
  const scores: RubricScores = { relevance: relevance.score, timeliness: timeliness.score, impact: impact.score, reader_value: readerValue.score, insight_potential: insight.score };
  const total = Number(Math.min(1, (Object.keys(cfg.weights) as (keyof RubricScores)[]).reduce((sum, axis) => sum + cfg.weights[axis] * scores[axis], 0)).toFixed(4));
  return {
    doc,
    scores,
    reasons: { relevance: relevance.reason, timeliness: timeliness.reason, impact: impact.reason, reader_value: readerValue.reason, insight_potential: insight.reason },
    total,
    tier: tierOf(total, scores.relevance, cfg, doc.source, doc.unextracted !== null),
    insightEligible: insight.score >= cfg.insight_trigger,
  };
}

/** Passing candidates in selection order: total, then timeliness, then url for determinism. */
export function selectionOrder(a: Scored, b: Scored): number {
  return b.total - a.total || b.scores.timeliness - a.scores.timeliness || a.doc.item.canonical_url.localeCompare(b.doc.item.canonical_url);
}

export const scoreStage: Stage<ScoreInput, ScoreOutput> = {
  name: "score",
  input: ScoreInput,
  output: ScoreOutput,
  idempotencyKey: (input) => `score:${input.candidates.map((candidate) => candidate.raw_item_id).sort().join("|")}`,
  async run(input, ctx: StageContext) {
    const started = Date.now();
    const cfg = ctx.scoring;
    const compiled = compileScoring(cfg);
    const version = rubricVersion(cfg.version);
    const caps = ctx.config.caps.briefs_per_cycle;
    const sources = new Map(input.sources.map((source) => [source.id, source]));
    const items = new Map(input.rawItems.map((item) => [item.id ?? rawItemId(item.canonical_url), item]));

    const scored: Scored[] = input.candidates.map((candidate) => {
      const item = items.get(candidate.raw_item_id);
      if (!item) throw new Error(`score: no raw item for candidate ${candidate.raw_item_id}`);
      return scoreCandidate(scoreDoc(candidate, item, sources.get(item.source_id), compiled), cfg, compiled, ctx.now);
    });

    // Selection: passing candidates in order, one per source, up to the cycle cap.
    const passing = scored.filter((entry) => entry.tier !== null).sort(selectionOrder);
    const rank = new Map<Scored, number>();
    const rejectReasons = new Map<Scored, string>();
    const perSource = new Map<string, number>();
    const selected: Scored[] = [];
    passing.forEach((entry, index) => {
      rank.set(entry, index + 1);
      const sourceId = entry.doc.item.source_id;
      const used = perSource.get(sourceId) ?? 0;
      if (selected.length >= caps.max) rejectReasons.set(entry, rejectReason(NOT_SELECTED, { rank: index + 1, max: caps.max }));
      else if (used >= cfg.selection.per_source_max) rejectReasons.set(entry, rejectReason(NOT_SELECTED, { source_cap: sourceId, rank: index + 1 }));
      else {
        selected.push(entry);
        perSource.set(sourceId, used + 1);
      }
    });
    let belowRelevance = 0;
    for (const entry of scored) {
      if (entry.tier !== null) continue;
      if (entry.scores.relevance < cfg.thresholds.relevance_min) {
        belowRelevance += 1;
        rejectReasons.set(entry, rejectReason(BELOW_THRESHOLD, { relevance: entry.scores.relevance, relevance_min: cfg.thresholds.relevance_min }));
      } else rejectReasons.set(entry, rejectReason(BELOW_THRESHOLD, { total: entry.total, brief: cfg.thresholds.brief }));
    }

    const rows: CandidateInsert[] = scored.map((entry) => ({
      id: candidateId(entry.doc.candidate.raw_item_id, version),
      raw_item_id: entry.doc.candidate.raw_item_id,
      run_id: ctx.runId,
      rubric_version: version,
      scores: entry.scores,
      total: entry.total,
      selected: selected.includes(entry),
      reject_reason: rejectReasons.get(entry) ?? null,
      rubric: { tier: entry.tier, rank: rank.get(entry) ?? null, insight_eligible: entry.insightEligible, reasons: entry.reasons },
    }));
    for (const chunk of chunks(rows as Row[], UPSERT_CHUNK)) await ctx.adapters.db.upsert("candidates", chunk, ["raw_item_id", "rubric_version"]);

    const byTotal = [...scored.keys()].sort((a, b) => selectionOrder(scored[a]!, scored[b]!));
    const decisions: ScoreDecision[] = byTotal.slice(0, DECISION_SAMPLE).map((index) => {
      const entry = scored[index]!;
      const row = rows[index]!;
      return {
        canonical_url: entry.doc.item.canonical_url,
        source_id: entry.doc.item.source_id,
        total: entry.total,
        tier: entry.tier,
        selected: row.selected,
        rank: rank.get(entry) ?? null,
        reject_reason: row.reject_reason,
        scores: entry.scores,
        reasons: entry.reasons,
      };
    });
    const stats: ScoreStats = {
      candidates: scored.length,
      passed: passing.length,
      full: passing.filter((entry) => entry.tier === "full").length,
      brief: passing.filter((entry) => entry.tier === "brief").length,
      below_threshold: scored.length - passing.length,
      below_relevance: belowRelevance,
      selected: selected.length,
      not_selected: passing.length - selected.length,
      insight_eligible: scored.filter((entry) => entry.insightEligible).length,
      shortfall: Math.max(0, caps.min - selected.length),
      decisions,
      ms: Date.now() - started,
    };
    for (const entry of selected) ctx.logger.info("score: candidate selected", { source_id: entry.doc.item.source_id, url: entry.doc.item.canonical_url, total: entry.total, tier: entry.tier, rank: rank.get(entry), scores: entry.scores });
    if (stats.shortfall > 0) ctx.logger.warn("score: fewer passing candidates than caps.briefs_per_cycle.min", { selected: stats.selected, min: caps.min, passed: stats.passed, candidates: stats.candidates });
    ctx.logger.info("score: candidates scored", { candidates: stats.candidates, passed: stats.passed, full: stats.full, brief: stats.brief, below_threshold: stats.below_threshold, below_relevance: stats.below_relevance, selected: stats.selected, not_selected: stats.not_selected, insight_eligible: stats.insight_eligible, shortfall: stats.shortfall, rubric_version: version });
    return { candidates: rows, selected: selected.map((entry) => rows[scored.indexOf(entry)]!), stats };
  },
};

export const scoreSpec = defineStageSpec({
  stage: scoreStage,
  select: (state) => ({ candidates: state.candidates, rawItems: state.rawItems, sources: state.sources }),
  merge: (state, output) => ({ ...state, candidates: output.candidates, selected: output.selected, scoreStats: output.stats }),
  counts: (output) => ({
    candidates: output.stats.candidates,
    passed: output.stats.passed,
    full: output.stats.full,
    brief: output.stats.brief,
    below_threshold: output.stats.below_threshold,
    below_relevance: output.stats.below_relevance,
    selected: output.stats.selected,
    not_selected: output.stats.not_selected,
    insight_eligible: output.stats.insight_eligible,
    shortfall: output.stats.shortfall,
  }),
});
