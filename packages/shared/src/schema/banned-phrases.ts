/**
 * `config/banned-phrases.yaml` (contracts.md §4, Phase 3d; AGENTS.md "Banned Generic
 * Patterns"). The single inventory of reader-facing phrases a draft must not contain.
 * The news_brief prompt renders the Korean phrases and each pattern's `note` into its
 * `{{banned_phrases}}` line, and the guard in packages/pipeline/src/checks matches
 * every phrase, hook start and pattern `regex` on every draft (reported in 3d,
 * blocking as QA 3g BANNED_PATTERN). Nothing here is copied into a prompt file: a
 * change is a change to this file and its `version`.
 */
import { z } from "zod";
import { RegexSource } from "./scoring.ts";

const Phrase = z.string().trim().min(1);
const Phrases = z.array(Phrase);
/** Entries by the language of the copy they appear in; the prompt shows the language it writes. */
const ByLanguage = z.strictObject({ ko: Phrases, en: Phrases });

export const BannedPattern = z.strictObject({
  name: z.string().regex(/^[a-z][a-z0-9_]*$/, "snake_case name"),
  /** What the prompt shows the model. */
  note: z.string().trim().min(1),
  /** What the guard matches (flags `iu`). */
  regex: RegexSource,
});
export type BannedPattern = z.infer<typeof BannedPattern>;

function duplicates(values: string[]): string[] {
  const seen = new Set<string>();
  const out = new Set<string>();
  for (const value of values) {
    const key = value.trim().toLowerCase().replace(/\s+/g, " "); // the guard matches any whitespace, so these are one phrase
    if (seen.has(key)) out.add(value);
    seen.add(key);
  }
  return [...out];
}

export const BannedPhrasesConfig = z
  .strictObject({
    /** Bump when an entry changes; drafts record the version they were checked against. */
    version: z.string().min(1),
    /** Exact phrases, matched case-insensitively with any whitespace between words. */
    phrases: ByLanguage,
    /** A field must not begin with these (legacy `blockedHookStarts`). */
    hook_starts: ByLanguage,
    patterns: z.array(BannedPattern),
  })
  .superRefine((config, ctx) => {
    const phraseDupes = duplicates([...config.phrases.ko, ...config.phrases.en]);
    if (phraseDupes.length > 0) ctx.addIssue({ code: "custom", path: ["phrases"], message: `duplicate phrase: ${phraseDupes.join(" | ")}` });
    const hookDupes = duplicates([...config.hook_starts.ko, ...config.hook_starts.en]);
    if (hookDupes.length > 0) ctx.addIssue({ code: "custom", path: ["hook_starts"], message: `duplicate hook start: ${hookDupes.join(" | ")}` });
    const nameDupes = duplicates(config.patterns.map((pattern) => pattern.name));
    if (nameDupes.length > 0) ctx.addIssue({ code: "custom", path: ["patterns"], message: `duplicate pattern name: ${nameDupes.join(" | ")}` });
  });
export type BannedPhrasesConfig = z.infer<typeof BannedPhrasesConfig>;
