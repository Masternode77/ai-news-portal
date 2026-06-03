function dateMs(article = {}) {
  const ms = new Date(article.analysisPublishedAt || article.publishedAt || article.updatedAt || 0).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function categoryKey(article = {}) {
  return String(article.primary_category || article.category || '').trim().toLowerCase();
}

function layerKey(article = {}) {
  return String(article.infrastructure_layer || article.public_routing?.editorial_lens || '').trim().toLowerCase();
}

function isRelatedCandidate(article = {}) {
  if (!article?.id) return false;
  if (article.public_status === 'quarantined' || article.public_status === 'archive_only_noindex') return false;
  if (article.archiveOnly === true || article.public_content_tier === 'hidden') return false;
  return true;
}

function newestFirst(a, b) {
  return dateMs(b) - dateMs(a);
}

function appendUnique(target, source, seen, limit) {
  for (const article of source) {
    if (target.length >= limit) return;
    if (seen.has(article.id)) continue;
    seen.add(article.id);
    target.push(article);
  }
}

export function relatedArticlesFor(current = {}, items = [], options = {}) {
  const limit = options.limit || 3;
  const currentCategory = categoryKey(current);
  const currentLayer = layerKey(current);
  const candidates = items
    .filter(isRelatedCandidate)
    .filter((article) => article.id !== current.id);
  const seen = new Set();
  const related = [];

  appendUnique(
    related,
    candidates
      .filter((article) => categoryKey(article) && categoryKey(article) === currentCategory)
      .sort(newestFirst),
    seen,
    limit
  );
  appendUnique(
    related,
    candidates
      .filter((article) => layerKey(article) && layerKey(article) === currentLayer)
      .sort(newestFirst),
    seen,
    limit
  );
  appendUnique(related, candidates.sort(newestFirst), seen, limit);

  return related;
}
