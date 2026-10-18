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
  title_ko: z.string().min(10).max(90),
  /** Re-narration in Korean; QA enforces a single continuous quote of at most 20 words. */
  summary_ko: z.string().min(200).max(1200),
  why_it_matters_ko: z.string().min(100),
  /** 3 to 5 sentences. */
  expert_lens_ko: z.string().min(150),
  source_url: HttpUrl,
  source_name: z.string().min(1),
  published_at_source: IsoDateTime,
  tags: z.array(z.string().min(1)).min(1).max(6),
  image: ImageResult.optional(),
  slug: NewsBriefSlug,
});
export type NewsBrief = z.infer<typeof NewsBrief>;

export const InsightEssay = z.strictObject({
  title_ko: z.string().min(10).max(90),
  /** One sentence. */
  thesis_ko: z.string().min(20).max(200),
  /** Structured per content/templates/insight_essay.md (Phase 3e). */
  body_ko: z.string().min(2500),
  counterpoint_ko: z.string().min(100),
  implications_ko: z.string().min(150),
  sources: z
    .array(
      z.strictObject({
        url: HttpUrl,
        name: z.string().min(1),
        published_at: IsoDateTime,
      }),
    )
    .min(2),
  /** Always present; `placeholder: true` when generation failed. */
  image: ImageResult,
  slug: InsightEssaySlug,
});
export type InsightEssay = z.infer<typeof InsightEssay>;

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
