import { seoNoindexReasons as qualityNoindexReasons } from '../../scripts/lib/seo-quality-policy.mjs';

export const ARTICLE_INDEXING_THRESHOLDS = {
  extractionQuality: 0.8,
  infrastructureRelevance: 0.75,
};

const numberOrNull = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

export const absoluteUrl = (base, path = '') =>
  `${String(base || '').replace(/\/$/, '')}/${String(path || '').replace(/^\//, '')}`;

export const sourceUrlFor = (article = {}) =>
  article.expertLensFull?.sourceLink
  || article.sourceCanonicalUrl
  || article.canonicalSourceUrl
  || article.originalSourceUrl
  || article.sourceUrl
  || article.url
  || '';

export const sourceDomainFor = (article = {}) => {
  const sourceUrl = sourceUrlFor(article);
  if (!sourceUrl) return '';
  try {
    return new URL(sourceUrl).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
};

export const sourceAttributionFor = (article = {}) => {
  const sourceUrl = sourceUrlFor(article);
  return {
    name: article.source || sourceDomainFor(article) || 'Original source',
    url: sourceUrl,
    domain: sourceDomainFor(article),
  };
};

export const articleSeoSignals = (article = {}) => {
  const extractionQuality = numberOrNull(article.extraction_quality_score);
  const infrastructureRelevance = numberOrNull(article.infrastructure_relevance_score);
  return {
    extractionQuality,
    infrastructureRelevance,
    hasExtractionQuality: extractionQuality !== null,
    hasInfrastructureRelevance: infrastructureRelevance !== null,
  };
};

export const articleNoindexReasons = (article = {}) => {
  const signals = articleSeoSignals(article);
  const routeLabel = String(article.blog_route || article.publishing_route || '').toLowerCase();
  const relevanceThreshold = routeLabel.includes('standard')
    ? 0.68
    : ARTICLE_INDEXING_THRESHOLDS.infrastructureRelevance;
  const reasons = [];
  const addReason = (reason) => {
    if (reason && !reasons.includes(reason)) reasons.push(reason);
  };

  if (article.seo_noindex === true) {
    const policyReasons = Array.isArray(article.seo_noindex_reasons)
      ? article.seo_noindex_reasons
      : [];
    if (policyReasons.length) {
      policyReasons.forEach(addReason);
    } else {
      addReason('seo_noindex_policy');
    }
  }

  if (article.articlePagePublished === false) {
    addReason('article_page_not_published');
  }

  if (article.archiveOnly === true || article.infrastructure_relevance_action === 'archive_only') {
    addReason('archive_only_relevance_action');
  }

  if (!signals.hasExtractionQuality) {
    addReason('missing_extraction_quality_score');
  }

  if (!signals.hasInfrastructureRelevance) {
    addReason('missing_infrastructure_relevance_score');
  }

  if (
    signals.hasExtractionQuality
    && signals.extractionQuality < ARTICLE_INDEXING_THRESHOLDS.extractionQuality
  ) {
    addReason(`extraction_quality_below_${ARTICLE_INDEXING_THRESHOLDS.extractionQuality}`);
  }

  if (
    signals.hasInfrastructureRelevance
    && signals.infrastructureRelevance < relevanceThreshold
  ) {
    addReason(`infrastructure_relevance_below_${relevanceThreshold}`);
  }

  qualityNoindexReasons(article).forEach(addReason);

  return reasons;
};

export const shouldNoindexArticle = (article = {}) => articleNoindexReasons(article).length > 0;

export const articleCanonicalPath = (article = {}) => `/news/${article.id}/`;

export const buildArticleStructuredData = ({
  article,
  site,
  title,
  description,
  image,
  canonicalUrl,
  taxonomy,
  articleBody = [],
}) => {
  const source = sourceAttributionFor(article);
  const imageUrl = image?.startsWith('http') ? image : absoluteUrl(site.url, image || site.defaultOgImage);
  const keywords = [
    taxonomy?.primary,
    taxonomy?.secondary,
    taxonomy?.layer,
    taxonomy?.articleType,
    taxonomy?.region,
    ...(taxonomy?.stakeholders || []),
    ...(article.tags || []),
  ].filter(Boolean);

  return {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    headline: title,
    description,
    image: [imageUrl],
    datePublished: article.publishedAt,
    dateModified: article.updatedAt || article.publishedAt,
    articleSection: taxonomy?.primary || article.primary_category || article.category || 'AI infrastructure',
    keywords,
    wordCount: articleBody.join(' ').split(/\s+/).filter(Boolean).length || undefined,
    isAccessibleForFree: true,
    inLanguage: article.lang || article.language || 'en',
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': canonicalUrl,
    },
    author: {
      '@type': 'Organization',
      name: site.name,
      url: site.url,
    },
    publisher: {
      '@type': 'Organization',
      name: site.name,
      url: site.url,
      logo: {
        '@type': 'ImageObject',
        url: absoluteUrl(site.url, site.defaultOgImage),
      },
    },
    citation: source.url || undefined,
    isBasedOn: source.url
      ? {
          '@type': 'CreativeWork',
          name: source.name,
          url: source.url,
          publisher: {
            '@type': 'Organization',
            name: source.name,
          },
        }
      : undefined,
    about: keywords.slice(0, 8).map((name) => ({
      '@type': 'Thing',
      name,
    })),
    correctionPolicy: absoluteUrl(site.url, '/editorial-policy/'),
    publishingPrinciples: absoluteUrl(site.url, '/editorial-policy/'),
    accountablePerson: {
      '@type': 'Organization',
      name: site.name,
    },
  };
};
