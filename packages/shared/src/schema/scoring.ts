/**
 * `config/scoring.yaml` (contracts.md §4, Phase 3c). The rubric engine in
 * packages/pipeline/src/stages/score.ts has a fixed *shape* (five axes, named
 * lifts and caps); every number, term list and pattern it uses lives here so a
 * threshold or vocabulary change is a config change (brief 3c: "임계값은 설정").
 *
 * Term lists are matched case-insensitively on whole words after the text is
 * normalised (Korean aliases → the English vocabulary, `&` → and, punctuation →
 * space). Pattern fields are regular-expression sources compiled with the `iu`
 * flags; an invalid one fails the load.
 */
import { z } from "zod";
import { NonNegativeInt, UnitInterval } from "./tables.ts";

export const RUBRIC_AXES = ["relevance", "timeliness", "impact", "reader_value", "insight_potential"] as const;
export type RubricAxis = (typeof RUBRIC_AXES)[number];

/** The eight relevance dimensions (legacy `relevance-classifier.mjs` DIMENSION_KEYS, renamed). */
export const RELEVANCE_DIMENSIONS = [
  "direct_ai_infrastructure",
  "data_center",
  "cloud_capacity",
  "semiconductor",
  "power_grid",
  "cooling",
  "capital_markets",
  "enterprise_ai",
] as const;
export type RelevanceDimension = (typeof RELEVANCE_DIMENSIONS)[number];

const Term = z.string().trim().min(1);
const Terms = z.array(Term);
/** `[term, weight]` as YAML writes it: `- [ai infrastructure, 0.48]`. */
export const WeightedTerm = z.tuple([Term, UnitInterval]);
export type WeightedTerm = z.infer<typeof WeightedTerm>;

export const RegexSource = z
  .string()
  .min(1)
  .refine(
    (source) => {
      try {
        new RegExp(source, "iu");
        return true;
      } catch {
        return false;
      }
    },
    { message: "invalid regular expression" },
  );

const Floor = z.strictObject({ min: UnitInterval, floor: UnitInterval });

export const RelevanceConfig = z.strictObject({
  /** A term also present in the title counts `1 + title_boost` times its weight. */
  title_boost: UnitInterval,
  /** Cap on one term's contribution after the title boost. */
  term_cap: UnitInterval,
  dimensions: z.record(z.enum(RELEVANCE_DIMENSIONS), z.array(WeightedTerm).min(1)),
  ai_terms: Terms.min(1),
  infra_terms: Terms.min(1),
  consumer_ai_terms: Terms,
  weak_ai_adjacent_terms: Terms,
  hard_archive_terms: Terms,
  /** Replaced by " power generation " before the hard-archive terms are tested (fossil *fuel* is on-beat, a fossil is not). */
  hard_archive_exception_pattern: RegexSource,
  adjacent_only_terms: Terms,
  formula: z.strictObject({
    top: UnitInterval,
    second: UnitInterval,
    /** Dimensions at or above this count toward the breadth bonus. */
    breadth_min: UnitInterval,
    breadth_step: UnitInterval,
    breadth_max: UnitInterval,
    direct_bonus_min: UnitInterval,
    direct_bonus: UnitInterval,
  }),
  /** Raise the direct-AI-infrastructure dimension when the story combines AI with physical capacity. */
  lifts: z.strictObject({
    ai_and_infra_add: UnitInterval,
    ai_and_data_center: Floor,
    ai_and_grid_and_data_center: z.strictObject({ grid_min: UnitInterval, data_center_min: UnitInterval, floor: UnitInterval }),
    data_center_and_grid: Floor,
    ai_and_cloud: Floor,
    consumer_ai_only_cap: UnitInterval,
  }),
  /** Ceilings on the overall score; each one names the condition it needs. */
  caps: z.strictObject({
    enterprise_only: z.strictObject({ enterprise_min: UnitInterval, direct_max: UnitInterval, physical_max: UnitInterval, cap: UnitInterval }),
    weak_ai_adjacent: z.strictObject({ direct_max: UnitInterval, physical_max: UnitInterval, cap: UnitInterval }),
    no_infra: z.strictObject({ with_ai: UnitInterval, without_ai: UnitInterval }),
    korean_market_chatter: UnitInterval,
    hard_archive: UnitInterval,
    adjacent_only: UnitInterval,
    procedural_notice: UnitInterval,
  }),
  /** Formulaic docket notices (Federal Register, FERC) are capped unless they carry an unambiguous compute hook. */
  procedural_notice: z.strictObject({
    source_id_prefixes: Terms,
    hosts: Terms,
    title_patterns: z.array(RegexSource),
    body_patterns: z.array(RegexSource),
    compute_context_terms: Terms,
    compute_context_patterns: z.array(RegexSource),
  }),
  korean: z.strictObject({
    /** Literal phrases (whitespace between characters is optional) rewritten to the English vocabulary before scoring. */
    aliases: z.array(z.strictObject({ from: Term, to: Term })),
    speculative_market_pattern: RegexSource,
    physical_infra_pattern: RegexSource,
  }),
});
export type RelevanceConfig = z.infer<typeof RelevanceConfig>;

export const TimelinessConfig = z
  .strictObject({
    /** Ascending `max_hours`; the first bucket whose bound the item's age does not exceed wins. */
    buckets: z.array(z.strictObject({ max_hours: z.number().positive(), score: UnitInterval })).min(1),
    /** Older than the last bucket. */
    beyond: UnitInterval,
    /** No source publication date. */
    unknown_date: UnitInterval,
  })
  .refine((v) => v.buckets.every((b, i) => i === 0 || b.max_hours > v.buckets[i - 1]!.max_hours), { message: "timeliness.buckets must be in ascending max_hours order" });
export type TimelinessConfig = z.infer<typeof TimelinessConfig>;

export const SignalConfig = z
  .strictObject({
    id: z.string().regex(/^[a-z][a-z0-9_]*$/, "snake_case id"),
    weight: UnitInterval,
    terms: Terms.min(1).optional(),
    pattern: RegexSource.optional(),
  })
  .refine((v) => (v.terms === undefined) !== (v.pattern === undefined), { message: "a signal needs exactly one of terms or pattern" });
export type SignalConfig = z.infer<typeof SignalConfig>;

export const ImpactConfig = z.strictObject({
  title_boost: UnitInterval,
  signals: z.array(SignalConfig).min(1),
});
export type ImpactConfig = z.infer<typeof ImpactConfig>;

export const ReaderValueConfig = z.strictObject({
  text_rights: z.strictObject({ full: UnitInterval, rewrite_only: UnitInterval, link_only: UnitInterval }),
  body: z.strictObject({ min_chars: NonNegativeInt, weight: UnitInterval }),
  tier: z.strictObject({ "1": UnitInterval, "2": UnitInterval, "3": UnitInterval }),
  region: z.strictObject({ terms: Terms.min(1), weight: UnitInterval }),
  figures: z.strictObject({ pattern: RegexSource, weight: UnitInterval }),
  /** Ceiling for `text_scope: abstract` sources (an abstract cannot carry a full brief). */
  abstract_cap: UnitInterval,
});
export type ReaderValueConfig = z.infer<typeof ReaderValueConfig>;

export const InsightPotentialConfig = z.strictObject({
  title_boost: UnitInterval,
  themes: z.array(z.strictObject({ id: z.string().regex(/^[a-z][a-z0-9_]*$/, "snake_case id"), terms: Terms.min(1), weight: UnitInterval })).min(1),
  /** A story that scores on several relevance dimensions has more angles for an essay. */
  breadth: z.strictObject({ min_dimensions: z.number().int().positive(), min_score: UnitInterval, bonus: UnitInterval }),
});
export type InsightPotentialConfig = z.infer<typeof InsightPotentialConfig>;

export const CandidateTier = z.enum(["full", "brief"]);
export type CandidateTier = z.infer<typeof CandidateTier>;

export const SelectionConfig = z.strictObject({
  /** Selected candidates per source in one run. */
  per_source_max: z.number().int().positive(),
  /** Highest tier a `text_scope: abstract` source can reach. */
  abstract_max_tier: CandidateTier,
});
export type SelectionConfig = z.infer<typeof SelectionConfig>;

export const RubricWeights = z
  .strictObject({
    relevance: UnitInterval,
    timeliness: UnitInterval,
    impact: UnitInterval,
    reader_value: UnitInterval,
    insight_potential: UnitInterval,
  })
  .refine((w) => Math.abs(RUBRIC_AXES.reduce((sum, axis) => sum + w[axis], 0) - 1) < 1e-6, { message: "weights must sum to 1" });
export type RubricWeights = z.infer<typeof RubricWeights>;

export const ScoringConfig = z.strictObject({
  /** Stamped as `candidates.rubric_version` (`score/<version>`); bump when any rule, weight or vocabulary changes. */
  version: z.string().min(1),
  weights: RubricWeights,
  thresholds: z
    .strictObject({ full: UnitInterval, brief: UnitInterval })
    .refine((t) => t.full >= t.brief, { message: "thresholds.full must be >= thresholds.brief" }),
  /** `insight_potential` at or above this marks the candidate eligible for an insight essay (3e). */
  insight_trigger: UnitInterval,
  selection: SelectionConfig,
  relevance: RelevanceConfig,
  timeliness: TimelinessConfig,
  impact: ImpactConfig,
  reader_value: ReaderValueConfig,
  insight_potential: InsightPotentialConfig,
});
export type ScoringConfig = z.infer<typeof ScoringConfig>;
