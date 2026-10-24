/**
 * YAML config loading with strict zod validation (P4: configuration over code).
 */
import { readFile } from "node:fs/promises";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import {
  BannedPhrasesConfig as BannedPhrasesConfigSchema,
  PromptFile as PromptFileSchema,
  PromptFrontMatter as PromptFrontMatterSchema,
  PipelineConfig as PipelineConfigSchema,
  RedirectsConfig as RedirectsConfigSchema,
  ScoringConfig as ScoringConfigSchema,
  SourcesConfig as SourcesConfigSchema,
} from "../schema/index.ts";
import type { BannedPhrasesConfig, PipelineConfig, PromptFile, RedirectsConfig, ScoringConfig, SourcesConfig } from "../schema/index.ts";
import { ConfigError } from "./errors.ts";
import { applyFlagOverrides } from "./flags.ts";
import type { FlagOverride } from "./flags.ts";

export interface LoadedPipelineConfig {
  config: PipelineConfig;
  overrides: FlagOverride[];
  path: string | undefined;
}

function formatIssues(error: z.ZodError): string {
  return error.issues.map((issue) => `${issue.path.join(".") || "<root>"}: ${issue.message}`).join("; ");
}

function parseWith<T>(schema: z.ZodType<T>, text: string, path: string | undefined): T {
  let data: unknown;
  try {
    data = parseYaml(text);
  } catch (error) {
    throw new ConfigError(`invalid YAML: ${error instanceof Error ? error.message : String(error)}`, path);
  }
  const result = schema.safeParse(data);
  if (!result.success) throw new ConfigError(formatIssues(result.error), path);
  return result.data;
}

export function parsePipelineConfig(
  text: string,
  options: { env?: NodeJS.ProcessEnv; path?: string } = {},
): LoadedPipelineConfig {
  const base = parseWith(PipelineConfigSchema, text, options.path);
  const { config, overrides } = applyFlagOverrides(base, options.env ?? {});
  return { config, overrides, path: options.path };
}

export async function loadPipelineConfig(path: string, env: NodeJS.ProcessEnv = process.env): Promise<LoadedPipelineConfig> {
  const text = await readConfigFile(path);
  return parsePipelineConfig(text, { env, path });
}

export function parseSourcesConfig(text: string, path?: string): SourcesConfig {
  return parseWith(SourcesConfigSchema, text, path);
}

export async function loadSourcesConfig(path: string): Promise<SourcesConfig> {
  return parseSourcesConfig(await readConfigFile(path), path);
}

export function parseScoringConfig(text: string, path?: string): ScoringConfig {
  return parseWith(ScoringConfigSchema, text, path);
}

export async function loadScoringConfig(path: string): Promise<ScoringConfig> {
  return parseScoringConfig(await readConfigFile(path), path);
}

export function parseBannedPhrasesConfig(text: string, path?: string): BannedPhrasesConfig {
  return parseWith(BannedPhrasesConfigSchema, text, path);
}

export async function loadBannedPhrasesConfig(path: string): Promise<BannedPhrasesConfig> {
  return parseBannedPhrasesConfig(await readConfigFile(path), path);
}

const FRONT_MATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

/** `prompts/<task>.md`: YAML front matter between `---` lines, then the system prompt. */
export function parsePromptFile(text: string, path?: string): PromptFile {
  const match = FRONT_MATTER.exec(text);
  if (!match) throw new ConfigError("prompt file needs a YAML front matter block between --- lines", path);
  const header = parseWith(PromptFrontMatterSchema, match[1] ?? "", path);
  const system = (match[2] ?? "").trim();
  const result = PromptFileSchema.safeParse({ ...header, system, ...(path ? { path } : {}) });
  if (!result.success) throw new ConfigError(formatIssues(result.error), path);
  return result.data;
}

export async function loadPromptFile(path: string): Promise<PromptFile> {
  return parsePromptFile(await readConfigFile(path), path);
}

export function parseRedirectsConfig(text: string, path?: string): RedirectsConfig {
  return parseWith(RedirectsConfigSchema, text, path);
}

export async function loadRedirectsConfig(path: string): Promise<RedirectsConfig> {
  return parseRedirectsConfig(await readConfigFile(path), path);
}

async function readConfigFile(path: string): Promise<string> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    throw new ConfigError(`cannot read file: ${error instanceof Error ? error.message : String(error)}`, path);
  }
}
