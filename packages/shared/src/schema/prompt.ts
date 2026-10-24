/**
 * `prompts/<task>.md` front matter (contracts.md §6, Phase 3d/3f). The body of
 * the file is the system prompt (LLM tasks) or the prompt template (image);
 * `version` is stamped on `drafts.prompt_version` / `image.provenance`.
 */
import { z } from "zod";
import { LlmTask } from "./content.ts";

export const PromptTask = z.union([LlmTask, z.literal("image")]);
export type PromptTask = z.infer<typeof PromptTask>;

const common = {
  /** Bump when the wording changes; drafts and image provenance carry it. */
  version: z.string().min(1),
  model_hint: z.string().min(1),
};

export const LlmPromptFrontMatter = z.strictObject({
  task: LlmTask,
  ...common,
  /** Name of the zod output schema the stage validates against (documentation; the stage binds it). */
  output_schema: z.string().min(1),
  max_output_tokens: z.number().int().positive().max(32000),
});
export type LlmPromptFrontMatter = z.infer<typeof LlmPromptFrontMatter>;

/** Phase 3f: the image prompt has no output schema or token budget; the body is a template with {{title}} … placeholders. */
export const ImagePromptFrontMatter = z.strictObject({ task: z.literal("image"), ...common });
export type ImagePromptFrontMatter = z.infer<typeof ImagePromptFrontMatter>;

export const PromptFrontMatter = z.union([LlmPromptFrontMatter, ImagePromptFrontMatter]);
export type PromptFrontMatter = z.infer<typeof PromptFrontMatter>;

const body = {
  /** The system prompt or template (everything after the front matter), trimmed. */
  system: z.string().min(1),
  path: z.string().optional(),
};
export const LlmPromptFile = z.strictObject({ ...LlmPromptFrontMatter.shape, ...body });
export type LlmPromptFile = z.infer<typeof LlmPromptFile>;
export const ImagePromptFile = z.strictObject({ ...ImagePromptFrontMatter.shape, ...body });
export type ImagePromptFile = z.infer<typeof ImagePromptFile>;
export const PromptFile = z.union([LlmPromptFile, ImagePromptFile]);
export type PromptFile = z.infer<typeof PromptFile>;

export function isLlmPromptFile(file: PromptFile): file is LlmPromptFile {
  return file.task !== "image";
}

/** A stage that needs an LLM prompt (system + token budget) refuses the image prompt by mistake. */
export function requireLlmPrompt(file: PromptFile): LlmPromptFile {
  if (!isLlmPromptFile(file)) throw new Error(`PROMPT_TASK_MISMATCH: expected an LLM prompt file, got task "${file.task}"`);
  return file;
}

export function requireImagePrompt(file: PromptFile): ImagePromptFile {
  if (isLlmPromptFile(file)) throw new Error(`PROMPT_TASK_MISMATCH: expected the image prompt file, got task "${file.task}"`);
  return file;
}
