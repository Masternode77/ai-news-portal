import { RELEVANCE_KEYWORDS } from './constants.mjs';

function recencyScore(isoDate) {
  const ageHours = (Date.now() - new Date(isoDate).getTime()) / (1000 * 60 * 60);
  if (ageHours <= 3) return 32;
  if (ageHours <= 8) return 24;
  if (ageHours <= 18) return 18;
  if (ageHours <= 30) return 12;
  if (ageHours <= 48) return 8;
  return 2;
}

function relevanceScore(item) {
  const haystack = `${item.title} ${item.snippet} ${item.contentText || ''}`.toLowerCase();
  let score = 0;
  for (const keyword of RELEVANCE_KEYWORDS) {
    if (haystack.includes(keyword)) score += 4;
  }
  if (/\b(ai|gpu|datacenter|data center|cloud|power|cooling|semiconductor)\b/i.test(item.title)) {
    score += 8;
  }
  return Math.min(score, 42);
}

function completenessScore(item) {
  let score = 0;
  if (item.snippet?.length > 80) score += 5;
  if (item.contentText?.length > 180) score += 7;
  if (item.defaultCategory || item.categoryHint) score += 2;
  return score;
}

export function scoreItem(item, sourceCount) {
  const sourcePenalty = Math.max(0, (sourceCount.get(item.source) || 0) - 1) * 4;
  return recencyScore(item.publishedAt) + relevanceScore(item) + completenessScore(item) - sourcePenalty;
}

export function rankWithDiversity(items) {
  const ranked = [];
  const sourceCount = new Map();
  const sorted = [...items].sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
  );

  for (const item of sorted) {
    const score = scoreItem(item, sourceCount);
    ranked.push({ ...item, score });
    sourceCount.set(item.source, (sourceCount.get(item.source) || 0) + 1);
  }

  return ranked.sort(
    (a, b) => b.score - a.score || new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
  );
}
