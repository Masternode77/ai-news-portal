import { guardPublicCopy } from './copy-quality-guard.mjs';

export const PREMIUM_MIN_VISIBLE_BODY_CHARS = 2500;
export const PREMIUM_MIN_ANALYSIS_PARAGRAPHS = 5;
export const PREMIUM_MIN_SOURCE_FACTS = 4;

function compact(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function bodyParagraphs(article = {}) {
  const body = article.expertLensFull?.finalArticleBody || article.articleText || article.body || '';
  return compact(body)
    .split(/(?:\n{2,}|(?<=[.!?])\s+(?=[A-Z0-9]))/)
    .map(compact)
    .filter((paragraph) => paragraph.length > 80);
}

function sourceFactCount(article = {}) {
  const explicit = article.source_backed_facts || article.sourceBackedFacts || article.facts;
  if (Array.isArray(explicit)) return explicit.filter(Boolean).length;
  const body = compact(article.expertLensFull?.finalArticleBody || article.articleText || '');
  const numericFacts = (body.match(/\b(?:\d+(?:\.\d+)?%?|\$[0-9][\d,.]*(?:\s?(?:million|billion|trillion))?|[A-Z][A-Za-z]+(?:\s[A-Z][A-Za-z]+){1,3})\b/g) || []).length;
  return Math.min(numericFacts, 8);
}

export function evaluatePremiumArticleQuality(article = {}) {
  const paragraphs = bodyParagraphs(article);
  const body = paragraphs.join('\n\n');
  const copy = guardPublicCopy(body);
  const checks = {
    min_visible_body_chars: body.length >= PREMIUM_MIN_VISIBLE_BODY_CHARS,
    min_source_backed_facts: sourceFactCount(article) >= PREMIUM_MIN_SOURCE_FACTS,
    min_analysis_paragraphs: paragraphs.length >= PREMIUM_MIN_ANALYSIS_PARAGRAPHS,
    stakeholder_impact: /stakeholder|operator|investor|buyer|supplier|developer|utility|enterprise/i.test(body),
    commercial_implication: /commercial|margin|pricing|contract|procurement|capex|revenue|cost|capital/i.test(body),
    counterargument: /counterpoint|counterargument|risk|however|but |constraint|exposure/i.test(body),
    watch_metric: /watch|metric|indicator|signal|track|monitor/i.test(body),
    bottom_line_thesis: /bottom line|thesis|means|matters|therefore/i.test(body),
    clean_public_copy: copy.ok,
  };
  const reasons = Object.entries(checks)
    .filter(([, ok]) => !ok)
    .map(([key]) => key);
  return {
    ok: reasons.length === 0,
    reasons,
    checks,
    visible_body_chars: body.length,
    analysis_paragraphs: paragraphs.length,
    source_backed_facts: sourceFactCount(article),
    copy_reasons: copy.reasons,
  };
}

export function premiumArticleReady(article = {}) {
  return evaluatePremiumArticleQuality(article).ok;
}
