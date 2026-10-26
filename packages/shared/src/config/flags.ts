/**
 * Feature flags (contracts.md §7). File values are the default; environment
 * variables prefixed `CC_FLAG_` override them. Unknown flag names fail loudly
 * so a typo cannot silently leave a stage enabled.
 */
import type { StageFlags, PipelineConfig, PublishTarget } from "../schema/index.ts";
import { PipelineConfig as PipelineConfigSchema, STAGE_NAMES } from "../schema/index.ts";
import { ConfigError } from "./errors.ts";

export const FLAG_ENV_PREFIX = "CC_FLAG_";

export interface FlagOverride {
  env: string;
  path: string;
  raw: string;
  value: boolean | string;
}

export interface FlagSnapshot {
  stages: StageFlags;
  publish_target: PublishTarget;
  /** Phase 3i: `notify.telegram.enabled` after overrides (`CC_FLAG_NOTIFY_TELEGRAM`). */
  notify_telegram: boolean;
  overrides: FlagOverride[];
}

const TRUE_VALUES = new Set(["1", "true", "on", "yes"]);
const FALSE_VALUES = new Set(["0", "false", "off", "no"]);

function parseBoolean(env: string, raw: string): boolean {
  const normalized = raw.trim().toLowerCase();
  if (TRUE_VALUES.has(normalized)) return true;
  if (FALSE_VALUES.has(normalized)) return false;
  throw new ConfigError(`${env}: expected a boolean (true/false), got "${raw}"`);
}

export function applyFlagOverrides(
  config: PipelineConfig,
  env: NodeJS.ProcessEnv = process.env,
): { config: PipelineConfig; overrides: FlagOverride[] } {
  const overrides: FlagOverride[] = [];
  const stages: Record<string, boolean> = { ...config.flags.stages };
  let publishTarget: string = config.flags.publish_target;
  let notifyTelegram = config.notify.telegram.enabled;

  for (const [key, raw] of Object.entries(env)) {
    if (!key.startsWith(FLAG_ENV_PREFIX) || raw === undefined) continue;
    const name = key.slice(FLAG_ENV_PREFIX.length);
    if (name.startsWith("STAGES_")) {
      const stage = name.slice("STAGES_".length).toLowerCase();
      if (!(STAGE_NAMES as readonly string[]).includes(stage)) {
        throw new ConfigError(`${key}: unknown stage "${stage}" (known: ${STAGE_NAMES.join(", ")})`);
      }
      const value = parseBoolean(key, raw);
      stages[stage] = value;
      overrides.push({ env: key, path: `flags.stages.${stage}`, raw, value });
      continue;
    }
    if (name === "PUBLISH_TARGET") {
      publishTarget = raw.trim();
      overrides.push({ env: key, path: "flags.publish_target", raw, value: publishTarget });
      continue;
    }
    if (name === "NOTIFY_TELEGRAM") {
      // The Telegram switch lives in notify.telegram.enabled; the override keeps the same path (contracts §7).
      notifyTelegram = parseBoolean(key, raw);
      overrides.push({ env: key, path: "notify.telegram.enabled", raw, value: notifyTelegram });
      continue;
    }
    throw new ConfigError(`${key}: unknown flag (known: CC_FLAG_STAGES_<STAGE>, CC_FLAG_PUBLISH_TARGET, CC_FLAG_NOTIFY_TELEGRAM)`);
  }

  const parsed = PipelineConfigSchema.safeParse({
    ...config,
    flags: { stages, publish_target: publishTarget },
    notify: { ...config.notify, telegram: { ...config.notify.telegram, enabled: notifyTelegram } },
  });
  if (!parsed.success) {
    throw new ConfigError(`flag override produced an invalid config: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
  }
  return { config: parsed.data, overrides };
}

export function flagSnapshot(config: PipelineConfig, overrides: FlagOverride[] = []): FlagSnapshot {
  return {
    stages: { ...config.flags.stages },
    publish_target: config.flags.publish_target,
    notify_telegram: config.notify.telegram.enabled,
    overrides: overrides.map((o) => ({ ...o })),
  };
}
