import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { repeatedParagraphs } from './repeated-language-detector.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PHRASE_PATHS = [
  path.join(ROOT, 'config/forbiddenAIPhrases.yml'),
  path.join(ROOT, 'config/forbiddenPublicPhrases.yml'),
];

function parseYamlPhrases(raw = '') {
  return String(raw).split(/\r?\n/)
    .map((line) => line.match(/^\s*-\s*["']?(.+?)["']?\s*$/)?.[1])
    .filter(Boolean);
}

export function loadForbiddenAiPhrases() {
  return [...new Set(PHRASE_PATHS.flatMap((filePath) => {
    try {
      return parseYamlPhrases(fs.readFileSync(filePath, 'utf8'));
    } catch {
      return [];
    }
  }))];
}

export const FORBIDDEN_AI_PHRASES = loadForbiddenAiPhrases();

function phraseMatches(text = '') {
  const haystack = String(text || '');
  return FORBIDDEN_AI_PHRASES.filter((phrase) => {
    const escaped = phrase
      .trim()
      .split(/\s+/)
      .map((token) => token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('[\\s\\W_]+')
      .replace(/\\\[layer\\\]/gi, '[a-z\\s/-]{2,80}');
    return new RegExp(`(^|[^A-Za-z0-9])${escaped}([^A-Za-z0-9]|$)`, 'i').test(haystack);
  });
}

export function antiTemplateGuardV2(text = '') {
  const matches = phraseMatches(text);
  const repeats = repeatedParagraphs(text);
  const reasons = [
    ...matches.map((match) => `forbidden_ai_phrase:${match}`),
    ...repeats.map(() => 'repeated_paragraph'),
  ];
  return {
    ok: reasons.length === 0,
    matches,
    repeatedParagraphCount: repeats.length,
    anti_template_score: reasons.length ? Math.max(0.2, 0.9 - reasons.length * 0.08) : 0.95,
    reasons,
  };
}
