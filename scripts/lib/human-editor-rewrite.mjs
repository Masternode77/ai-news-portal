import { normalizeProperNouns } from './proper-noun-normalizer.mjs';
import { guardPublicCopy } from './copy-quality-guard.mjs';

const REPLACEMENTS = [
  [/in the rapidly evolving/gi, 'in the current'],
  [/underscores/gi, 'shows'],
  [/highlights the importance of/gi, 'puts pressure on'],
  [/as AI continues to/gi, 'as AI demand'],
  [/in today's digital landscape/gi, 'in current infrastructure planning'],
  [/\bthe development\b/gi, 'the item'],
  [/\bthe issue is\b/gi, 'the constraint is'],
  [/\bthe practical question is\b/gi, 'the decision point is'],
  [/\bsource-backed change\b/gi, 'reported item'],
  [/\bthe watch metric is\b/gi, 'track'],
];

export function humanEditorRewrite(draft = '') {
  let text = normalizeProperNouns(String(draft || ''));
  for (const [pattern, replacement] of REPLACEMENTS) {
    text = text.replace(pattern, replacement);
  }
  return text
    .split(/\n{2,}/)
    .map((block) => guardPublicCopy(block).text)
    .filter(Boolean)
    .join('\n\n');
}
