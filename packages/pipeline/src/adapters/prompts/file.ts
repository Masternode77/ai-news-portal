/**
 * Prompt registry (contracts.md §6, Phase 3d): `prompts/<task>.md` files with a
 * YAML front matter, parsed once per run and cached. Tests use the in-memory
 * variant so a prompt change in the repo cannot silently alter a unit test.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parsePromptFile } from "@cc/shared";
import type { LlmTask, PromptFile, PromptRegistry } from "@cc/shared";

export interface FilePromptOptions {
  promptsDir: string;
}

export function createFilePromptRegistry(options: FilePromptOptions): PromptRegistry {
  const cache = new Map<LlmTask, Promise<PromptFile>>();
  return {
    get(task: LlmTask): Promise<PromptFile> {
      let pending = cache.get(task);
      if (!pending) {
        const path = join(options.promptsDir, `${task}.md`);
        pending = readFile(path, "utf8").then(
          (text) => parsePromptFile(text, path),
          (error: unknown) => {
            throw new Error(`PROMPT_MISSING: ${path} (${error instanceof Error ? error.message : String(error)})`);
          },
        );
        cache.set(task, pending);
      }
      return pending;
    },
  };
}

export function createMemoryPromptRegistry(files: Partial<Record<LlmTask, PromptFile>>): PromptRegistry {
  return {
    async get(task: LlmTask): Promise<PromptFile> {
      const file = files[task];
      if (!file) throw new Error(`PROMPT_MISSING: no in-memory prompt for task "${task}"`);
      return file;
    },
  };
}
