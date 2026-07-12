import {
  articleImageAlt,
  articleImageVariants,
} from './article-image-surface.mjs';
import { sourceAttributionFor, sourceUrlFor } from '../../src/lib/seo-safeguards.js';
import { safePublicHttpUrl } from '../../src/lib/public-url.js';

export const PUBLIC_ARTICLE_STATUSES = {
  DRAFT: 'draft',
  PUBLISHED: 'published',
  HIDDEN: 'hidden',
  NOINDEX: 'noindex',
};

export const PUBLIC_ARTICLE_TIERS = {
  LONGFORM_ANALYSIS: 'longform_analysis',
  EDITORIAL_BRIEF: 'editorial_brief',
  SOURCE_ONLY: 'source_only',
  HIDDEN: 'hidden',
};

const CONTRACT_VERSION = 'public-article-v1';

const KNOWN_LEGACY_FIELDS = new Set([
  'id',
  'slug',
  'public_slug',
  'source',
  'url',
  'sourceUrl',
  'sourceCanonicalUrl',
  'canonicalSourceUrl',
  'originalSourceUrl',
  'canonicalUrl',
  'title',
  'headline',
  'deck',
  'summary',
  'snippet',
  'contentText',
  'articleText',
  'fullArticleText',
  'expertLensFull',
  'expertLensShort',
  'expertLens',
  'public_presentation',
  'category',
  'defaultCategory',
  'primary_category',
  'secondary_category',
  'tags',
  'region',
  'language',
  'lang',
  'publishedAt',
  'analysisPublishedAt',
  'updatedAt',
  'public_status',
  'publicStatus',
  'public_content_tier',
  'public_tier',
  'publicTier',
  'blog_route',
  'publishing_route',
  'draft',
  'quarantined',
  'archiveOnly',
  'homepagePublished',
  'articlePagePublished',
  'signalCardOnly',
  'noindex',
  'seo_noindex',
  'seo_noindex_reasons',
  'noindex_reason',
  'public_routing',
  'infrastructure_relevance_score',
  'infrastructure_relevance_tier',
  'infrastructure_relevance_action',
  'extraction_quality_score',
  'generatedImage',
  'sourceImage',
  'image',
  'imageUrl',
  'image_url',
  'thumbnail',
  'generatedImageProvider',
  'generatedImageModel',
  'imageProvider',
  'image_source_provider',
  'imagePrompt',
  'imageStatus',
  'image_status',
  'imageError',
  'image_error',
  'audit_log_refs',
  'auditLogRefs',
  'emergency_cleanup_audit',
  'publicArticleContract',
]);

function clean(value = '') {
  return String(value || '').trim();
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function firstText(...values) {
  for (const value of values) {
    if (Array.isArray(value)) {
      const joined = value.map(clean).filter(Boolean).join('\n\n');
      if (joined) return joined;
      continue;
    }
    const text = clean(value);
    if (text) return text;
  }
  return '';
}

function normalizeTags(value) {
  if (Array.isArray(value)) {
    return [...new Set(value.map(clean).filter(Boolean))];
  }
  if (typeof value === 'string') {
    return [...new Set(value.split(',').map(clean).filter(Boolean))];
  }
  return [];
}

function normalizeLegacyStatus(article = {}) {
  const raw = clean(article.publicStatus || article.public_status || article.status).toLowerCase();
  const hasExplicitNoindex = article.noindex === true || article.seo_noindex === true;

  if (article.draft === true) return PUBLIC_ARTICLE_STATUSES.DRAFT;
  if (article.quarantined === true) return PUBLIC_ARTICLE_STATUSES.HIDDEN;

  if (!raw) {
    if (article.public_content_tier === 'hidden' || article.archiveOnly === true) {
      return hasExplicitNoindex ? PUBLIC_ARTICLE_STATUSES.NOINDEX : PUBLIC_ARTICLE_STATUSES.HIDDEN;
    }
    return hasExplicitNoindex ? PUBLIC_ARTICLE_STATUSES.NOINDEX : PUBLIC_ARTICLE_STATUSES.PUBLISHED;
  }

  const mapped = {
    draft: PUBLIC_ARTICLE_STATUSES.DRAFT,
    published: hasExplicitNoindex ? PUBLIC_ARTICLE_STATUSES.NOINDEX : PUBLIC_ARTICLE_STATUSES.PUBLISHED,
    watchlist: hasExplicitNoindex ? PUBLIC_ARTICLE_STATUSES.NOINDEX : PUBLIC_ARTICLE_STATUSES.PUBLISHED,
    adjacent_watchlist: hasExplicitNoindex ? PUBLIC_ARTICLE_STATUSES.NOINDEX : PUBLIC_ARTICLE_STATUSES.PUBLISHED,
    signal: hasExplicitNoindex ? PUBLIC_ARTICLE_STATUSES.NOINDEX : PUBLIC_ARTICLE_STATUSES.PUBLISHED,
    short_signal: hasExplicitNoindex ? PUBLIC_ARTICLE_STATUSES.NOINDEX : PUBLIC_ARTICLE_STATUSES.PUBLISHED,
    brief: hasExplicitNoindex ? PUBLIC_ARTICLE_STATUSES.NOINDEX : PUBLIC_ARTICLE_STATUSES.PUBLISHED,
    hidden: PUBLIC_ARTICLE_STATUSES.HIDDEN,
    quarantined: PUBLIC_ARTICLE_STATUSES.HIDDEN,
    archive_only_noindex: PUBLIC_ARTICLE_STATUSES.NOINDEX,
    noindex: PUBLIC_ARTICLE_STATUSES.NOINDEX,
  };

  return mapped[raw] || raw;
}

function normalizeLegacyTier(article = {}) {
  const raw = clean(article.publicTier || article.public_tier || article.public_content_tier || article.tier).toLowerCase();
  const mapped = {
    longform_analysis: PUBLIC_ARTICLE_TIERS.LONGFORM_ANALYSIS,
    featured_analysis: PUBLIC_ARTICLE_TIERS.LONGFORM_ANALYSIS,
    editorial_brief: PUBLIC_ARTICLE_TIERS.EDITORIAL_BRIEF,
    brief: PUBLIC_ARTICLE_TIERS.EDITORIAL_BRIEF,
    signal_card: PUBLIC_ARTICLE_TIERS.SOURCE_ONLY,
    signal: PUBLIC_ARTICLE_TIERS.SOURCE_ONLY,
    source_only: PUBLIC_ARTICLE_TIERS.SOURCE_ONLY,
    hidden: PUBLIC_ARTICLE_TIERS.HIDDEN,
  };

  if (mapped[raw]) return mapped[raw];
  if (raw) return raw;
  if (article.public_status === 'quarantined' || article.archiveOnly === true) return PUBLIC_ARTICLE_TIERS.HIDDEN;
  if (article.articlePagePublished === false || article.signalCardOnly === true) return PUBLIC_ARTICLE_TIERS.SOURCE_ONLY;
  return PUBLIC_ARTICLE_TIERS.LONGFORM_ANALYSIS;
}

function normalizeAuditRefs(article = {}) {
  const refs = article.auditLogRefs || article.audit_log_refs || [];
  if (Array.isArray(refs)) return refs;
  if (refs) return [refs];
  if (article.emergency_cleanup_audit) return ['emergency_cleanup_audit'];
  return [];
}

function imageObject(article = {}, image = articleImageVariants(article).hero) {
  const imageMeta = typeof image === 'string' ? { url: image } : image;
  const url = clean(imageMeta.url);
  const status = clean(article.imageStatus || article.image_status)
    || clean(imageMeta.status)
    || (url ? 'available' : 'missing');
  return {
    url,
    alt: articleImageAlt(article),
    status,
    error: clean(article.imageError || article.image_error),
    provider: clean(imageMeta.provider || article.generatedImageProvider || article.imageProvider || article.image_source_provider),
    model: clean(article.generatedImageModel),
    prompt: clean(article.imagePrompt),
  };
}

function unknownFieldsFor(article = {}) {
  return Object.keys(article).filter((key) => !KNOWN_LEGACY_FIELDS.has(key));
}

function noindexReasonsFor(article = {}, status) {
  const reasons = [];
  if (status === PUBLIC_ARTICLE_STATUSES.NOINDEX) reasons.push('contract_status_noindex');
  if (Array.isArray(article.seo_noindex_reasons)) reasons.push(...article.seo_noindex_reasons);
  if (article.noindex_reason) reasons.push(article.noindex_reason);
  return [...new Set(reasons.map(clean).filter(Boolean))];
}

function visibilityFor(article = {}, status, tier) {
  const noindex = status === PUBLIC_ARTICLE_STATUSES.NOINDEX;
  const hidden = status === PUBLIC_ARTICLE_STATUSES.HIDDEN || tier === PUBLIC_ARTICLE_TIERS.HIDDEN;
  const draft = status === PUBLIC_ARTICLE_STATUSES.DRAFT;
  const detailPage = !hidden
    && !draft
    && tier === PUBLIC_ARTICLE_TIERS.LONGFORM_ANALYSIS
    && article.articlePagePublished !== false;
  const homepage = !hidden
    && !draft
    && status === PUBLIC_ARTICLE_STATUSES.PUBLISHED
    && article.homepagePublished !== false;

  return {
    public: !hidden && !draft,
    homepage,
    detailPage,
    noindex,
  };
}

function maybeAbsoluteUrl(value = '') {
  const url = clean(value);
  if (!url) return '';
  try {
    const parsed = new URL(url);
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.toString() : url;
  } catch {
    return url;
  }
}

function withSiteUrl(pathOrUrl = '', siteUrl = '') {
  const value = clean(pathOrUrl);
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  const site = clean(siteUrl).replace(/\/$/, '');
  return site ? `${site}${value.startsWith('/') ? value : `/${value}`}` : value;
}

export function migratePublicArticleContract(article = {}) {
  if (!isObject(article)) {
    const contract = {
      contractVersion: CONTRACT_VERSION,
      id: '',
      title: '',
      dek: '',
      bodyMarkdown: '',
      category: '',
      tags: [],
      source: { name: 'Original source', url: '', domain: '' },
      status: PUBLIC_ARTICLE_STATUSES.DRAFT,
      tier: PUBLIC_ARTICLE_TIERS.SOURCE_ONLY,
      relevanceStatus: '',
      publishedAt: '',
      updatedAt: '',
      canonicalUrl: '',
      sourceUrl: '',
      images: {
        hero: imageObject({}),
        thumbnail: imageObject({}),
        og: imageObject({}),
      },
      imageStatus: 'missing',
      imageError: '',
      auditLogRefs: [],
      noindexReasons: [],
      visibility: {
        public: false,
        homepage: false,
        detailPage: false,
        noindex: false,
      },
    };
    const validation = validatePublicArticleContract(contract);
    return {
      ok: false,
      errors: ['public article record must be an object', ...validation.errors],
      article: {},
      contract,
      unknownFields: [],
      unknownFieldsPreserved: true,
    };
  }

  const status = normalizeLegacyStatus(article);
  const tier = normalizeLegacyTier(article);
  const imageVariants = articleImageVariants(article);
  const displayImage = imageVariants.hero.url;
  const source = sourceAttributionFor(article);
  const sourceUrl = sourceUrlFor(article);
  const noindexReasons = noindexReasonsFor(article, status);
  const visibility = visibilityFor(article, status, tier);
  const contract = {
    contractVersion: CONTRACT_VERSION,
    id: clean(article.id),
    slug: clean(article.slug || article.public_slug),
    title: firstText(article.expertLensFull?.finalHeadline, article.title, article.headline),
    dek: firstText(
      article.deck,
      article.public_presentation?.deck,
      article.expertLensFull?.metaDescription,
      article.summary,
      article.snippet
    ),
    bodyMarkdown: clean(
      article.expertLensFull?.finalArticleBody
      ?? article.fullArticleText
      ?? article.articleText
      ?? article.contentText
      ?? article.snippet
      ?? ''
    ),
    category: firstText(article.primary_category, article.category, article.defaultCategory, 'AI Infrastructure'),
    tags: normalizeTags(article.tags),
    source: {
      name: source.name,
      url: maybeAbsoluteUrl(source.url || sourceUrl),
      domain: source.domain,
    },
    legacyPublicStatus: clean(article.publicStatus || article.public_status),
    status,
    tier,
    relevanceStatus: firstText(
      article.infrastructure_relevance_action,
      article.infrastructure_relevance_tier,
      article.public_routing?.visibility
    ),
    publishedAt: firstText(article.analysisPublishedAt, article.publishedAt),
    updatedAt: firstText(article.updatedAt),
    canonicalUrl: firstText(article.canonicalUrl, article.publicCanonicalUrl, article.url),
    sourceUrl: maybeAbsoluteUrl(sourceUrl),
    images: {
      hero: imageObject(article, imageVariants.hero),
      thumbnail: imageObject(article, imageVariants.thumbnail),
      og: imageObject(article, imageVariants.og),
    },
    imageStatus: clean(article.imageStatus || article.image_status) || (displayImage ? 'available' : 'missing'),
    imageError: clean(article.imageError || article.image_error),
    auditLogRefs: normalizeAuditRefs(article),
    noindexReasons,
    visibility,
  };

  const migratedArticle = {
    ...article,
    publicArticleContract: contract,
  };
  const unknownFields = unknownFieldsFor(article);
  const unknownFieldsPreserved = unknownFields.every((field) => Object.is(migratedArticle[field], article[field]));
  const validation = validatePublicArticleContract(contract);

  return {
    ok: validation.ok,
    errors: validation.errors,
    article: migratedArticle,
    contract,
    unknownFields,
    unknownFieldsPreserved,
  };
}

export function validatePublicArticleContract(contract = {}) {
  const errors = [];
  const statusValues = Object.values(PUBLIC_ARTICLE_STATUSES);
  const tierValues = Object.values(PUBLIC_ARTICLE_TIERS);

  if (!clean(contract.id)) errors.push('missing id');
  const status = clean(contract.status);
  if (!statusValues.includes(status)) errors.push(`invalid status: ${status || '(empty)'}`);
  if (!tierValues.includes(contract.tier)) errors.push(`invalid tier: ${contract.tier || '(empty)'}`);

  const sourceUrl = clean(contract.source?.url || contract.sourceUrl);
  if (sourceUrl) {
    try {
      const parsed = new URL(sourceUrl);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        errors.push(`invalid source URL: ${sourceUrl}`);
      }
    } catch {
      errors.push(`invalid source URL: ${sourceUrl}`);
    }
  }

  return {
    ok: errors.length === 0,
    errors,
  };
}

function asContract(value = {}) {
  if (value?.contractVersion === CONTRACT_VERSION) return value;
  if (value?.publicArticleContract?.contractVersion === CONTRACT_VERSION) return value.publicArticleContract;
  return migratePublicArticleContract(value).contract;
}

export function publicArticlePath(article = {}) {
  const contract = asContract(article);
  if (contract.visibility?.detailPage !== true) return '';
  return clean(contract.id) ? `/news/${encodeURIComponent(contract.id)}/` : '';
}

export function publicArticleUrl(article = {}, options = {}) {
  const contract = asContract(article);
  if (
    contract.status === PUBLIC_ARTICLE_STATUSES.PUBLISHED
    && contract.tier !== PUBLIC_ARTICLE_TIERS.LONGFORM_ANALYSIS
  ) {
    return safePublicHttpUrl(contract.source?.url || contract.sourceUrl);
  }
  const path = publicArticlePath(contract);
  if (path) return withSiteUrl(path, options.siteUrl);
  return '';
}

export function isSitemapEligible(article = {}) {
  const contract = asContract(article);
  return contract.status === PUBLIC_ARTICLE_STATUSES.PUBLISHED
    && contract.tier === PUBLIC_ARTICLE_TIERS.LONGFORM_ANALYSIS
    && contract.visibility?.detailPage === true
    && contract.visibility?.noindex !== true
    && Boolean(publicArticlePath(contract));
}

export function isRssEligible(article = {}) {
  const contract = asContract(article);
  return contract.status === PUBLIC_ARTICLE_STATUSES.PUBLISHED
    && contract.visibility?.homepage === true
    && contract.visibility?.noindex !== true
    && validatePublicArticleContract(contract).ok
    && Boolean(publicArticleUrl(contract));
}

export function isAdminEditable(article = {}) {
  return Boolean(clean(asContract(article).id));
}

export function publicArticleContractSummary(migration = {}) {
  const contract = migration.contract || asContract(migration);
  return {
    id: contract.id,
    title: contract.title,
    status: contract.status,
    tier: contract.tier,
    relevanceStatus: contract.relevanceStatus,
    sourceAttribution: contract.source,
    sourceUrl: contract.sourceUrl,
    publicPath: publicArticlePath(contract),
    publicUrl: publicArticleUrl(contract),
    sitemapEligible: isSitemapEligible(contract),
    rssEligible: isRssEligible(contract),
    adminEditable: isAdminEditable(contract),
    noindex: contract.visibility?.noindex === true,
    image: {
      hero: contract.images.hero.url,
      thumbnail: contract.images.thumbnail.url,
      og: contract.images.og.url,
      status: contract.imageStatus,
      error: contract.imageError,
    },
    auditLogRefs: contract.auditLogRefs,
    unknownFields: migration.unknownFields || [],
    unknownFieldsPreserved: migration.unknownFieldsPreserved === true,
    errors: migration.errors || [],
  };
}

export function publicArticleTier(article = {}) {
  return asContract(article).tier;
}

export function publicArticleStatus(article = {}) {
  return asContract(article).status;
}

export function publicArchiveEligible(article = {}) {
  const contract = asContract(article);
  return Boolean(contract.id && contract.status !== PUBLIC_ARTICLE_STATUSES.HIDDEN);
}

export function publicSitemapEligible(article = {}) {
  return isSitemapEligible(article);
}

export function publicRssEligible(article = {}) {
  return isRssEligible(article);
}

export function adminEditable(article = {}) {
  return isAdminEditable(article);
}

export function migratePublicArticleRecord(article = {}) {
  const migration = migratePublicArticleContract(article);
  const contract = migration.contract;
  return {
    ...migration.article,
    public_url: publicArticleUrl(contract),
    publicUrl: publicArticleUrl(contract),
    public_tier: contract.tier,
    publicTier: contract.tier,
    public_status: contract.status,
    publicStatus: contract.status,
    public_visibility: contract.visibility.public
      ? contract.visibility.detailPage
        ? 'core'
        : 'adjacent'
      : 'hidden',
    publicVisibility: contract.visibility.public
      ? contract.visibility.detailPage
        ? 'core'
        : 'adjacent'
      : 'hidden',
    public_noindex: contract.visibility.noindex,
    publicNoindex: contract.visibility.noindex,
    public_sitemap_eligible: isSitemapEligible(contract),
    publicSitemapEligible: isSitemapEligible(contract),
    public_rss_eligible: isRssEligible(contract),
    publicRssEligible: isRssEligible(contract),
    public_archive_eligible: publicArchiveEligible(contract),
    publicArchiveEligible: publicArchiveEligible(contract),
    public_admin_editable: isAdminEditable(contract),
    publicAdminEditable: isAdminEditable(contract),
    public_source_url: contract.sourceUrl,
    publicSourceUrl: contract.sourceUrl,
    public_canonical_url: contract.canonicalUrl,
    publicCanonicalUrl: contract.canonicalUrl,
    public_image_url: contract.images.hero.url,
    publicImageUrl: contract.images.hero.url,
  };
}

export { visibilityFor as publicArticleVisibility };

export function publicArticleContract(article = {}) {
  return migratePublicArticleContract(article).contract;
}
