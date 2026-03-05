import { RELEVANCE_KEYWORDS } from './constants.mjs';

function recencyScore(isoDate) {
  const ageHours = (Date.now() - new Date(isoDate).getTime()) / (1000 * 60 * 60);
  if (ageHours <= 6) return 35;
  if (ageHours <= 12) return 25;
  if (ageHours <= 24) return 20;
  if (ageHours <= 48) return 12;
  if (ageHours <= 72) return 6;
  return 1;
}

function relevanceScore(item) {
  const haystack = `${item.title} ${item.snippet}`.toLowerCase();
  let score = 0;

  for (const keyword of RELEVANCE_KEYWORDS) {
    if (haystack.includes(keyword)) score += 4;
  }

  if (/\b(ai|gpu|semiconductor|chip|datacenter|data center|cloud)\b/i.test(item.title)) {
    score += 8;
  }

  return Math.min(score, 45);
}

export function scoreItem(item, sourceCount) {
  const sourcePenalty = Math.max(0, (sourceCount.get(item.source) || 0) - 1) * 5;
  return recencyScore(item.publishedAt) + relevanceScore(item) - sourcePenalty;
}

export function rankWithDiversity(items) {
  const sourceCount = new Map();
  const ranked = items
    .map((item) => {
      const score = scoreItem(item, sourceCount);
      sourceCount.set(item.source, (sourceCount.get(item.source) || 0) + 1);
      return { ...item, score };
    })
    .sort((a, b) => b.score - a.score || new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

  return ranked;
}
