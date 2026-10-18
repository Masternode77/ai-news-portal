/**
 * YAML config loading with strict zod validation (P4: configuration over code).
 */
import { readFile } from "node:fs/promises";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import {
  PipelineConfig as PipelineConfigSchema,
  RedirectsConfig as RedirectsConfigSchema,
  SourcesConfig as SourcesConfigSchema,
} from "../schema/index.ts";
import type { PipelineConfig, RedirectsConfig, SourcesConfig } from "../schema/index.ts";
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
