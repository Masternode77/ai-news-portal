/**
 * Prompt registry (contracts.md §6, Phase 3d): `prompts/<task>.md` files with a
 * YAML front matter, parsed once per run and cached. Tests use the in-memory
 * variant so a prompt change in the repo cannot silently alter a unit test.
 *
 * Phase 3e: a prompt may pull a document into its body with a line
 * `<!-- include: ../content/voice/josh_voice.md -->` — a path relative to the
 * prompt file that stays inside the repository (the prompts directory's
 * parent); the document's own front matter is dropped. One level only: an
 * included document's include lines are left as they are. The voice and the
 * essay template are written once, in content/, and the prompt renders them.
 * Changing an included document changes the prompt: bump the prompt's version.
 */
import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve, sep } from "node:path";
import { parsePromptFile } from "@cc/shared";
import type { PromptFile, PromptRegistry, PromptTask } from "@cc/shared";

export interface FilePromptOptions {
  promptsDir: string;
}

export function createFilePromptRegistry(options: FilePromptOptions): PromptRegistry {
  const cache = new Map<PromptTask, Promise<PromptFile>>();
  return {
    get(task: PromptTask): Promise<PromptFile> {
      let pending = cache.get(task);
      if (!pending) {
        const path = join(options.promptsDir, `${task}.md`);
        pending = readFile(path, "utf8").then(
          async (text) => parsePromptFile(await resolveIncludes(text, path), path),
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

export const PROMPT_INCLUDE_INVALID = "PROMPT_INCLUDE_INVALID";
const INCLUDE = /<!--\s*include:\s*(\S+?)\s*-->/gu;
const DOCUMENT_FRONT_MATTER = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/u;

/** The prompt text with every include line replaced by the named document (front matter dropped). */
export async function resolveIncludes(text: string, promptPath: string): Promise<string> {
  const base = dirname(resolve(promptPath));
  const root = dirname(base);
  const includes = [...text.matchAll(INCLUDE)];
  if (includes.length === 0) return text;
  const documents = new Map<string, string>();
  for (const match of includes) {
    const target = match[1]!;
    if (isAbsolute(target)) throw new Error(`${PROMPT_INCLUDE_INVALID}: ${promptPath} includes an absolute path (${target})`);
    const full = resolve(base, target);
    if (!full.startsWith(`${root}${sep}`)) throw new Error(`${PROMPT_INCLUDE_INVALID}: ${promptPath} includes ${target}, outside ${root}`);
    if (documents.has(target)) continue;
    let content: string;
    try {
      content = await readFile(full, "utf8");
    } catch (error) {
      throw new Error(`${PROMPT_INCLUDE_INVALID}: ${promptPath} includes ${target} (${error instanceof Error ? error.message : String(error)})`);
    }
    documents.set(target, content.replace(DOCUMENT_FRONT_MATTER, "").trim());
  }
  return text.replace(INCLUDE, (_line, target: string) => documents.get(target)!);
}

export function createMemoryPromptRegistry(files: Partial<Record<PromptTask, PromptFile>>): PromptRegistry {
  return {
    async get(task: PromptTask): Promise<PromptFile> {
      const file = files[task];
      if (!file) throw new Error(`PROMPT_MISSING: no in-memory prompt for task "${task}"`);
      return file;
    },
  };
}
