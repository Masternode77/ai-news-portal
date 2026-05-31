function clean(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function queueForResult(result = {}) {
  const reasons = (result.reasons || []).join(' ');
  if (/forced_generation_failure|generation_failure/.test(reasons)) return 'regeneration-needed';
  if (/low_relevance|outside_product_boundary|outside_compute_current_product_boundary/.test(reasons)) return 'low-relevance';
  if (result.public_extraction_passed === false || result.extraction_passed === false && !result.brief) return 'failed-extraction';
  if (result.relevance?.visibility === 'hidden' || result.tier === 'hidden' || result.tier === 'source_only') return 'low-relevance';
  if (result.longformGenerated === false && result.tier === 'longform_analysis') return 'regeneration-needed';
  return '';
}

export function buildAdminReviewQueueEntry(article = {}, result = {}, now = new Date().toISOString()) {
  const queue = queueForResult(result);
  if (!queue) return null;
  return {
    id: `${clean(article.id || result.id)}:${queue}`,
    articleId: clean(article.id || result.id),
    queue,
    title: clean(article.title || result.title),
    source: clean(article.source),
    sourceUrl: clean(article.sourceUrl || article.url),
    reasons: [...new Set((result.reasons || []).map(clean).filter(Boolean))],
    createdAt: now,
  };
}

export function mergeAdminReviewQueue(existing = [], entries = []) {
  const byId = new Map();
  for (const entry of existing) {
    if (entry?.id) byId.set(entry.id, entry);
  }
  for (const entry of entries) {
    if (entry?.id) byId.set(entry.id, entry);
  }
  return [...byId.values()].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
}
