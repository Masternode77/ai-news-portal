import { shouldNoindexArticle } from '../../src/lib/seo-safeguards.js';
import { articleDetailQualityEligible } from './article-detail-quality-gate.mjs';

export function isPublicLongformArticle(article = {}) {
  return Boolean(
    article?.id
      && article.articlePagePublished !== false
      && article.signalCardOnly !== true
      && article.public_content_tier !== 'signal_card'
      && article.public_content_tier !== 'editorial_brief'
      && article.public_status !== 'quarantined'
      && article.public_status !== 'archive_only_noindex'
      && article.archiveOnly !== true
      && !shouldNoindexArticle(article)
      && articleDetailQualityEligible(article)
  );
}
