function compact(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

export function buildProjectedSearchText(article = {}, overrides = {}) {
  const presentation = article.public_presentation || article.publicSignal || {};
  const values = [
    overrides.title ?? presentation.title ?? article.title,
    overrides.deck ?? presentation.deck ?? article.deck,
    overrides.why_it_matters ?? presentation.why_it_matters ?? article.why_it_matters,
    overrides.category ?? presentation.category ?? article.primary_category ?? article.category,
    overrides.source ?? presentation.source ?? article.source,
    overrides.label ?? presentation.signal_label ?? presentation.label,
    overrides.date ?? presentation.date ?? article.analysisPublishedAt ?? article.publishedAt,
    article.infrastructure_layer,
    ...(Array.isArray(article.tags) ? article.tags : []),
  ].map(compact).filter(Boolean);
  return [...new Set(values)].join(' ');
}
