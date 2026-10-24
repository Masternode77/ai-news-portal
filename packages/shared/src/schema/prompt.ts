/**
 * `prompts/<task>.md` front matter (contracts.md §6, Phase 3d). The body of the
 * file is the system prompt; `version` is stamped on `drafts.prompt_version`.
 */
import { z } from "zod";
import { LlmTask } from "./content.ts";

export const PromptFrontMatter = z.strictObject({
  task: LlmTask,
  /** Bump when the wording changes; drafts carry it. */
  version: z.string().min(1),
  model_hint: z.string().min(1),
  /** Name of the zod output schema the stage validates against (documentation; the stage binds it). */
  output_schema: z.string().min(1),
  max_output_tokens: z.number().int().positive().max(32000),
});
export type PromptFrontMatter = z.infer<typeof PromptFrontMatter>;

export const PromptFile = z.strictObject({
  ...PromptFrontMatter.shape,
  /** The system prompt (everything after the front matter), trimmed. */
  system: z.string().min(1),
  path: z.string().optional(),
});
export type PromptFile = z.infer<typeof PromptFile>;
