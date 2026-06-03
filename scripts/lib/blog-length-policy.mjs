import { paragraphCount, sectionCount, visibleBodyLength, wordCount } from './visible-body-length.mjs';

export const BLOG_LENGTH_POLICY = {
  core_longform_blog: {
    label: 'Core Longform Blog',
    minVisibleBodyCharacters: 4500,
    targetWordsMin: 900,
    targetWordsMax: 1400,
    minParagraphs: 12,
    minSections: 6,
  },
  standard_blog: {
    label: 'Standard Blog',
    minVisibleBodyCharacters: 4500,
    targetWordsMin: 650,
    targetWordsMax: 1000,
    minParagraphs: 8,
    minSections: 5,
  },
  short_signal: {
    label: 'Short Signal',
    targetWordsMin: 150,
    targetWordsMax: 250,
    minParagraphs: 2,
    minSections: 1,
  },
};

export function normalizeBlogRoute(route = '') {
  const normalized = String(route || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  if (normalized.includes('core')) return 'core_longform_blog';
  if (normalized.includes('standard')) return 'standard_blog';
  if (normalized.includes('short')) return 'short_signal';
  return normalized || 'standard_blog';
}

export function lengthPolicyFor(route = '') {
  return BLOG_LENGTH_POLICY[normalizeBlogRoute(route)] || BLOG_LENGTH_POLICY.standard_blog;
}

export function blogLengthResult(body = '', route = 'standard_blog') {
  const policy = lengthPolicyFor(route);
  const metrics = {
    visibleBodyCharacters: visibleBodyLength(body),
    wordCount: wordCount(body),
    paragraphCount: paragraphCount(body),
    sectionCount: sectionCount(body),
  };
  const reasons = [];

  if (policy.minVisibleBodyCharacters && metrics.visibleBodyCharacters < policy.minVisibleBodyCharacters) {
    reasons.push(`visible_body_below_${policy.minVisibleBodyCharacters}`);
  }
  if (policy.minParagraphs && metrics.paragraphCount < policy.minParagraphs) {
    reasons.push(`paragraphs_below_${policy.minParagraphs}`);
  }
  if (policy.minSections && metrics.sectionCount < policy.minSections) {
    reasons.push(`sections_below_${policy.minSections}`);
  }
  if (policy.targetWordsMin && metrics.wordCount < policy.targetWordsMin) {
    reasons.push(`words_below_${policy.targetWordsMin}`);
  }

  return {
    ok: reasons.length === 0,
    route: normalizeBlogRoute(route),
    policy,
    metrics,
    reasons,
  };
}
