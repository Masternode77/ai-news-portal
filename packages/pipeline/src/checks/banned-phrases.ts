/**
 * Banned-phrase guard (AGENTS.md "Banned Generic Patterns", ADR-004 `BANNED_PATTERN`).
 * `config/banned-phrases.yaml` is compiled once per run and every entry is matched on
 * the reader-facing fields of a draft. Phase 3d reports the result on each draft
 * (`drafts.body.checks.banned`) and in the stage stats; QA 3g turns a match into a
 * blocking verdict. The prompt's 금지 표현 line is rendered from the same inventory
 * (`bannedPhrasePromptText`), so the model is told exactly what the guard enforces
 * and a new entry reaches both places with one config change.
 */
import type { BannedPhrasesConfig } from "@cc/shared";

export interface CompiledBannedPhrases {
  version: string;
  phrases: { text: string; regex: RegExp }[];
  hookStarts: { text: string; lower: string }[];
  patterns: { name: string; regex: RegExp }[];
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** A phrase matches case-insensitively with any whitespace between its words. */
export function phraseRegex(text: string): RegExp {
  return new RegExp(text.trim().split(/\s+/).map(escapeRegExp).join("\\s+"), "iu");
}

export function compileBannedPhrases(config: BannedPhrasesConfig): CompiledBannedPhrases {
  return {
    version: config.version,
    phrases: [...config.phrases.ko, ...config.phrases.en].map((text) => ({ text, regex: phraseRegex(text) })),
    hookStarts: [...config.hook_starts.ko, ...config.hook_starts.en].map((text) => ({ text, lower: text.trim().toLowerCase() })),
    patterns: config.patterns.map((pattern) => ({ name: pattern.name, regex: new RegExp(pattern.regex, "iu") })),
  };
}

export interface BannedCheckResult {
  /** `config/banned-phrases.yaml` version the draft was checked against. */
  version: string;
  /** `phrase:<text>`, `hook_start:<text>` or `pattern:<name>`, each at most once, in inventory order. */
  matches: string[];
  pass: boolean;
}

/** Every reader-facing field of a draft against the compiled inventory; a field's start is also checked against the hook starts. */
export function bannedPhraseCheck(fields: Record<string, string>, compiled: CompiledBannedPhrases): BannedCheckResult {
  const matches = new Set<string>();
  const values = Object.values(fields).map((value) => value.trim());
  for (const phrase of compiled.phrases) if (values.some((value) => phrase.regex.test(value))) matches.add(`phrase:${phrase.text}`);
  for (const start of compiled.hookStarts) if (values.some((value) => value.toLowerCase().startsWith(start.lower))) matches.add(`hook_start:${start.text}`);
  for (const pattern of compiled.patterns) if (values.some((value) => pattern.regex.test(value))) matches.add(`pattern:${pattern.name}`);
  return { version: compiled.version, matches: [...matches], pass: matches.size === 0 };
}

/** The prompt's 금지 표현 line: the phrases of the language the prompt writes (Korean), quoted, then each pattern's note. */
export function bannedPhrasePromptText(config: BannedPhrasesConfig): string {
  return [...config.phrases.ko.map((phrase) => `"${phrase}"`), ...config.patterns.map((pattern) => pattern.note)].join(", ");
}
