import { buildPublicPresentation } from './public-presentation.mjs';
import { routePublicLane } from './public-lane-router.mjs';
import { sourceExtractionPassesPublicGate } from './source-extraction-fail-closed.mjs';
import { shouldNoindexPublicArticle } from './seo-quality-policy.mjs';

export function publicSearchEligible(article = {}, route = routePublicLane(article)) {
  return route.visibility !== 'archive'
    && article.homepagePublished !== false
    && article.archiveOnly !== true
    && article.infrastructure_relevance_action !== 'archive_only'
    && article.public_status !== 'quarantined'
    && article.public_status !== 'archive_only_noindex'
    && !shouldNoindexPublicArticle(article, { route })
    && sourceExtractionPassesPublicGate(article).ok;
}

export function buildPublicSearchPayload(article = {}, helpers = {}) {
  const route = helpers.route || routePublicLane(article);
  const presentation = buildPublicPresentation(article, { route });
  const displayHeadline = helpers.displayHeadline || ((item) => item.title || '');
  const cleanEditorialText = helpers.cleanEditorialText || ((text) => String(text || '').trim());
  const shouldNoindexArticle = helpers.shouldNoindexArticle || (() => false);

  return {
    signal_label: presentation.signal_label,
    editorial_lens: presentation.editorial_lens,
    public_deck: presentation.deck,
    why_it_matters: presentation.why_it_matters,
    id: article.id,
    title: displayHeadline(article),
    source: article.source,
    category: article.primary_category || article.category,
    primary_category: article.primary_category || article.category,
    secondary_category: article.secondary_category,
    infrastructure_layer: article.infrastructure_layer,
    affected_stakeholders: article.affected_stakeholders || [],
    article_type: article.article_type,
    region: article.region,
    summary: cleanEditorialText(presentation.why_it_matters || article.summary || article.snippet || ''),
    expertLensTeaser: cleanEditorialText(presentation.deck || article.summary || article.snippet || ''),
    searchText: [
      article.title,
      article.source,
      article.primary_category,
      article.secondary_category,
      article.infrastructure_layer,
      article.article_type,
      ...(article.affected_stakeholders || []),
      article.category,
      article.region,
      presentation.deck,
      presentation.why_it_matters,
      ...(article.tags || []),
    ].filter(Boolean).join(' '),
    publishedAt: article.publishedAt,
    href: article.articlePagePublished === false || shouldNoindexArticle(article) ? article.sourceUrl || article.url : `/news/${article.id}/`,
    sourceUrl: article.sourceUrl || article.url,
  };
}
