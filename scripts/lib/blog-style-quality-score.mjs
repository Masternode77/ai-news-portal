import { forbiddenPublicPhraseMatches } from './copy-quality-guard.mjs';
import { blogLengthResult } from './blog-length-policy.mjs';

export function blogStyleQualityScore(body = '', route = 'standard_blog') {
  const length = blogLengthResult(body, route);
  const forbidden = forbiddenPublicPhraseMatches(body);
  const hasBottomLine = /\bBottom Line\b/i.test(body);
  const hasCounter = /\b(counter|bear case|not proven|limitation|break|offset|mislead|missing)\b/i.test(body);
  const hasThesis = /\bThesis\b/i.test(body);
  const paragraphVariety = String(body).split(/\n{2,}/).map((p) => p.length).filter(Boolean);
  const hasVariety = new Set(paragraphVariety.map((len) => Math.round(len / 80))).size >= 3;

  const penalties = [
    ...length.reasons,
    ...forbidden,
    ...(!hasBottomLine ? ['missing_bottom_line'] : []),
    ...(!hasCounter ? ['missing_counterargument'] : []),
    ...(!hasThesis ? ['missing_thesis'] : []),
    ...(!hasVariety ? ['flat_paragraph_lengths'] : []),
  ];

  const base = 1 - Math.min(0.5, penalties.length * 0.06);
  return {
    ok: penalties.length === 0,
    blog_style_quality_score: Number(base.toFixed(3)),
    reasons: penalties,
    length,
  };
}
