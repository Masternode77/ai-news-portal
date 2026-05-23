import { normalizeProperNouns } from './proper-noun-normalizer.mjs';
import { guardPublicCopy } from './copy-quality-guard.mjs';

const REPLACEMENTS = [
  [/Commercially,\s*/gi, 'From a buyer and investor view, '],
  [/Operationally,\s*/gi, 'For operators, '],
  [/worth a local Compute Current read/gi, 'material for Compute Current analysis'],
  [/lens for infrastructure readers/gi, 'decision point for infrastructure teams'],
  [/reported item can translate into/gi, 'reported event changes'],
  [/readers should test whether/gi, 'readers should verify whether'],
  [/not merely adding another generic AI headline/gi, 'changing an observable infrastructure control point'],
  [/not just another AI headline/gi, 'an infrastructure control-point story'],
  [/\bsource-backed change\b/gi, 'reported event'],
  [/\bthe watch metric is\b/gi, 'watch'],
  [/\bin the rapidly evolving\b/gi, 'in the current'],
  [/\bunderscores\b/gi, 'shows'],
  [/\bhighlights the importance of\b/gi, 'puts pressure on'],
  [/\bas AI continues to\b/gi, 'as AI demand'],
  [/\bthe development\b/gi, 'the signal'],
  [/\bthe issue is\b/gi, 'the constraint is'],
];

export function editAnalystStyle(text = '') {
  let out = normalizeProperNouns(String(text || ''));
  for (const [pattern, replacement] of REPLACEMENTS) out = out.replace(pattern, replacement);
  return out
    .split(/\n{2,}/)
    .map((block) => guardPublicCopy(block).text)
    .filter(Boolean)
    .join('\n\n');
}
