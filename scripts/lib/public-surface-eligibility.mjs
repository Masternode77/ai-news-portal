import { shouldNoindexArticle } from '../../src/lib/seo-safeguards.js';
import { articleDetailQualityEligible } from './article-detail-quality-gate.mjs';
import { hasPublishedArticlePage } from './article-publication-state.mjs';
import { isPublicProductFit } from './public-product-fit.mjs';
import { currentSourceTextAuthorization } from './source-text-publication-authorization.mjs';

// Every route gate except the detail-quality gate (which includes the
// reader-copy check). The reader-copy audit uses this to decide whether a
// news record has a page at all before it inspects the copy on that page.
export function publicLongformRouteGates(article = {}, options = {}) {
  return Boolean(
    article?.id
      && hasPublishedArticlePage(article)
      && article.signalCardOnly !== true
      && article.public_content_tier !== 'signal_card'
      && article.public_content_tier !== 'editorial_brief'
      && article.public_status !== 'quarantined'
      && article.public_status !== 'archive_only_noindex'
      && article.archiveOnly !== true
      && isPublicProductFit(article)
      && !shouldNoindexArticle(article)
      && currentSourceTextAuthorization(article, article.extraction_artifact, options).ok
  );
}

export function isPublicLongformArticle(article = {}, options = {}) {
  return publicLongformRouteGates(article, options) && articleDetailQualityEligible(article);
}
