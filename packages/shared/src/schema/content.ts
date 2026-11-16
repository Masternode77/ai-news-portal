/**
 * Reader-facing content schemas (brief Appendix A, contracts.md §3) and the
 * LLM / QA message shapes used across adapters.
 */
import { z } from "zod";
import { HttpUrl, ImageResult, IsoDateTime, JsonRecord, Severity } from "./tables.ts";

export const NewsBriefSlug = z.string().regex(/^news\/[a-f0-9]{16}$/, "news/<16 hex>");
export const InsightEssaySlug = z
  .string()
  .regex(/^column\/[a-z0-9-]{1,64}-\d{4}-\d{2}-\d{2}$/, "column/<slug>-YYYY-MM-DD");

export const NewsBrief = z.strictObject({
  /** Sentence-case English headline (ADR-009: every article is English for an Anglophone readership). */
  title: z.string().min(20).max(120),
  /** Re-narration in English; QA enforces a single continuous quote of at most 20 words. */
  summary: z.string().min(300).max(2400),
  why_it_matters: z.string().min(200),
  /** 3 to 5 sentences. */
  expert_lens: z.string().min(300),
  source_url: HttpUrl,
  source_name: z.string().min(1),
  published_at_source: IsoDateTime,
  tags: z.array(z.string().min(1)).min(1).max(6),
  image: ImageResult.optional(),
  slug: NewsBriefSlug,
});
export type NewsBrief = z.infer<typeof NewsBrief>;

/**
 * What the model writes (Phase 3d): the reader-facing fields only. The stage
 * fills `source_url`, `source_name`, `published_at_source` and `slug` from the
 * raw item, so a model can never invent a source.
 */
export const NewsBriefDraft = NewsBrief.pick({ title: true, summary: true, why_it_matters: true, expert_lens: true, tags: true });
export type NewsBriefDraft = z.infer<typeof NewsBriefDraft>;

/** The reader-facing text fields of a news_brief, in reading order. */
export const BRIEF_TEXT_FIELDS = ["title", "summary", "why_it_matters", "expert_lens"] as const;
export type BriefTextField = (typeof BRIEF_TEXT_FIELDS)[number];

/**
 * Korean-era key of each field. Drafts and publications written before the
 * English switch (ADR-009, 2026-11-04) store `title_ko`, `summary_ko`, … — the
 * readers below accept both so those rows still render and review; nothing
 * new is written under these keys.
 */
export const BRIEF_KO_KEYS: Readonly<Record<BriefTextField, string>> = {
  title: "title_ko",
  summary: "summary_ko",
  why_it_matters: "why_it_matters_ko",
  expert_lens: "expert_lens_ko",
};

/** One text field of a stored brief (drafts.body.brief, publications.body), current key first, then the Korean-era key. */
export function storedBriefField(raw: unknown, field: BriefTextField): string | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const value = record[field] ?? record[BRIEF_KO_KEYS[field]];
  return typeof value === "string" ? value : null;
}

/**
 * An insight essay for The Current (Phase 3e, Josh 2026-11-16): the reading of one development under Josh
 * Jiwoon Inn's byline, structured per content/templates/insight_essay.md and voiced per
 * content/voice/josh_voice.md. Stored as `drafts.body.essay`. Lengths are floors that catch a truncated or
 * empty reply; the template's word ranges are checked by the soft QA rule ESSAY_STRUCTURE, so a slightly
 * short essay is held for review instead of being thrown away after the call was paid for.
 */
export const InsightEssay = z.strictObject({
  /** The reading, not the news (template: 40–90 characters, sentence case). */
  title: z.string().min(20).max(120),
  /** One or two sentences under the title; also the meta description. */
  deck: z.string().min(80).max(400),
  /** One sentence the essay defends, stated so it could be wrong. */
  thesis: z.string().min(40).max(400),
  /** The argument in Markdown: opening facts, the reading, then `##` sections (template: 800–1,300 words). */
  body: z.string().min(4500),
  /** The strongest case against the thesis, under its own `##` heading (template: 150–300 words). */
  counterpoint: z.string().min(600),
  /** Two or three conditional observables, under their own `##` heading (template: 150–300 words). */
  implications: z.string().min(600),
  tags: z.array(z.string().min(1)).min(1).max(6),
  /** Filled by the stage from the candidate; at least one primary source (Josh D1, 2026-11-16). */
  sources: z
    .array(
      z.strictObject({
        url: HttpUrl,
        name: z.string().min(1),
        published_at: IsoDateTime,
      }),
    )
    .min(1),
  /** Set by the image stage on the publication; a draft carries none. */
  image: ImageResult.optional(),
  slug: InsightEssaySlug,
});
export type InsightEssay = z.infer<typeof InsightEssay>;

/** What the model writes for an essay; sources, slug and image are the stage's (the model never writes URLs or dates it was not given). */
export const InsightEssayDraft = InsightEssay.pick({ title: true, deck: true, thesis: true, body: true, counterpoint: true, implications: true, tags: true });
export type InsightEssayDraft = z.infer<typeof InsightEssayDraft>;

/** The reader-facing text fields of an insight_essay, in reading order. */
export const ESSAY_TEXT_FIELDS = ["title", "deck", "thesis", "body", "counterpoint", "implications"] as const;
export type EssayTextField = (typeof ESSAY_TEXT_FIELDS)[number];

export const LlmTask = z.enum(["curate", "news_brief", "expert_lens", "insight_essay", "qa_assist"]);
export type LlmTask = z.infer<typeof LlmTask>;

export const LlmMessage = z.strictObject({
  role: z.enum(["user", "assistant"]),
  content: z.string(),
});
export type LlmMessage = z.infer<typeof LlmMessage>;

export const LlmRequest = z.strictObject({
  task: LlmTask,
  /** Chosen per task from config.llm.models. */
  model: z.string().min(1),
  system: z.string(),
  messages: z.array(LlmMessage).min(1),
  /** JSON schema for structured output (derived from zod via z.toJSONSchema). */
  outputSchema: JsonRecord.optional(),
  maxOutputTokens: z.number().int().positive(),
  /** `version` from the prompts/<task>.md front matter. */
  promptVersion: z.string().min(1),
  /** Stable key for this request (e.g. `news_brief:<raw_item_id>`): the fixture adapter looks up `fixtures/llm/<task>/<key>.json` by it (Phase 3d). */
  cacheKey: z.string().min(1).optional(),
});
export type LlmRequest = z.infer<typeof LlmRequest>;

export const LlmUsage = z.strictObject({
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  cacheReadTokens: z.number().int().nonnegative().default(0),
});
export type LlmUsage = z.infer<typeof LlmUsage>;

export const LlmResponse = z.strictObject({
  text: z.string(),
  json: z.unknown().optional(),
  usage: LlmUsage,
  costUsd: z.number().nonnegative(),
  model: z.string().min(1),
  stopReason: z.string().min(1),
});
export type LlmResponse = z.infer<typeof LlmResponse>;

export const QaVerdict = z.strictObject({
  rule: z.string().min(1),
  severity: Severity,
  pass: z.boolean(),
  reason_code: z.string().min(1),
  evidence: JsonRecord,
  checked_at: IsoDateTime,
});
export type QaVerdict = z.infer<typeof QaVerdict>;

export const ExtractedText = z.strictObject({
  text: z.string(),
  chars: z.number().int().nonnegative(),
  method: z.string().min(1),
});
export type ExtractedText = z.infer<typeof ExtractedText>;
