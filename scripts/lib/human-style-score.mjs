import { paragraphCount, sectionCount, wordCount } from './visible-body-length.mjs';

export function humanStyleScore(text = '') {
  const words = wordCount(text);
  const paragraphs = paragraphCount(text);
  const sections = sectionCount(text);
  const hasCounter = /\b(counter|bear case|limitation|does not prove|missing evidence|uncertainty)\b/i.test(text);
  const hasBottom = /\bBottom line\b/i.test(text);
  const varied = new Set(String(text).split(/\n{2,}/).map((p) => Math.min(6, Math.floor(p.length / 120)))).size >= 3;
  let score = 0.68;
  if (words >= 650) score += 0.07;
  if (paragraphs >= 10) score += 0.05;
  if (sections >= 6) score += 0.05;
  if (hasCounter) score += 0.05;
  if (hasBottom) score += 0.04;
  if (varied) score += 0.04;
  const reasons = [];
  if (!hasCounter) reasons.push('missing_counterargument');
  if (!hasBottom) reasons.push('missing_bottom_line');
  if (!varied) reasons.push('paragraph_rhythm_too_flat');
  return { human_style_score: Number(Math.min(score, 0.98).toFixed(3)), reasons };
}
