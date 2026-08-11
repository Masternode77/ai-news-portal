import { shouldNoindexArticle } from '../../src/lib/seo-safeguards.js';
import { articleDetailQualityEligible } from './article-detail-quality-gate.mjs';
import { hasPublishedArticlePage } from './article-publication-state.mjs';
import { isPublicProductFit } from './public-product-fit.mjs';
import { currentSourceTextAuthorization } from './source-text-publication-authorization.mjs';

export function isPublicLongformArticle(article = {}, options = {}) {
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
      && articleDetailQualityEligible(article)
      && currentSourceTextAuthorization(article, article.extraction_artifact, options).ok
  );
}
