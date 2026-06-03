import { fallbackCategoryImagePath } from './article-image-surface.mjs';
import { buildRssItems } from './rss-builder.mjs';
import { buildSitemapEntries } from './sitemap-builder.mjs';
import { sourceExtractionPassesLongformGate, sourceExtractionPassesPublicGate } from './source-extraction-fail-closed.mjs';
import { routePublicLane } from './public-lane-router.mjs';
import { buildCategoryPages, archivePages } from './taxonomy-page-builder.mjs';
import { detectTruncationArtifacts } from './truncation-detector.mjs';

export const LEGACY_MIGRATION_ACTIONS = ['regenerate_longform', 'regenerate_brief', 'assign_fallback_image', 'hidden_noindex', 'delete_or_410'];
const IMAGE_FIELDS = ['heroImage', 'generatedImage', 'thumbnailImage', 'ogImage', 'sourceImage', 'image', 'imageUrl', 'image_url', 'thumbnail'];

const clean = (value = '') => String(value || '').trim();

function textBundle(article = {}) {
  return [
    article.title,
    article.source,
    article.summary,
    article.snippet,
    article.deck,
    article.articleText,
    article.contentText,
    article.fullArticleText,
    article.primary_category,
    article.category,
    article.infrastructure_layer,
    ...(Array.isArray(article.tags) ? article.tags : []),
  ].map(clean).filter(Boolean).join(' ');
}

const sourceText = (article = {}) => clean(article.articleText || article.contentText || article.fullArticleText || article.rawText || article.summary || article.snippet);

function manualCoreApproval(article = {}) {
  return article.manuallyApprovedCore === true ||
    article.manual_core_approval === true ||
    article.editorial_override === 'core_feed';
}

function lowQualityConsumerBoundary(article = {}) {
  const text = textBundle(article).toLowerCase();
  return /\b(app store|mobile game|gaming|wearable|smart glasses|consumer|3d printer|mascot|avatar|shopping app)\b/.test(text);
}

const explicitImage = (article = {}) => IMAGE_FIELDS.some((field) => clean(article[field]));

function classificationRecord(article = {}, action, reasons = []) {
  return {
    id: article.id || '',
    title: article.title || '',
    source: article.source || '',
    action,
    route: routePublicLane(article),
    reasons: [...new Set(reasons.filter(Boolean))],
    article,
  };
}

const namedBriefExample = (article = {}) => /land and expand|nvidia,\s*iren|coatue|switch|core scientific/i.test(textBundle(article));

export function classifyLegacyArticle(article = {}) {
  const text = sourceText(article);
  const route = routePublicLane(article);
  const publicGate = sourceExtractionPassesPublicGate(article);
  const longformGate = sourceExtractionPassesLongformGate(article);
  const truncation = detectTruncationArtifacts(text || textBundle(article));
  const sourceMissing = !clean(article.sourceUrl || article.url);
  const extractionScore = Number(article.extraction_quality_score ?? article.source_quality_score ?? 1);

  if ((sourceMissing && (!truncation.ok || text.length < 160)) || extractionScore < 0.2) {
    return classificationRecord(article, 'delete_or_410', [
      sourceMissing ? 'missing_source_url' : '',
      !truncation.ok ? 'truncation_artifact' : '',
      extractionScore < 0.2 ? 'extraction_quality_below_0.2' : '',
    ]);
  }

  if (!manualCoreApproval(article) && (lowQualityConsumerBoundary(article) || route.visibility === 'archive')) {
    return classificationRecord(article, 'hidden_noindex', [
      lowQualityConsumerBoundary(article) ? 'consumer_or_low_fit_topic' : '',
      ...(route.blocked_reasons || []),
    ]);
  }

  if (namedBriefExample(article)) {
    return classificationRecord(article, 'regenerate_brief', ['named_legacy_brief_example']);
  }

  if (longformGate.ok && route.visibility === 'core') {
    return classificationRecord(article, 'regenerate_longform', ['longform_source_gate_passed']);
  }

  if (!explicitImage(article) && publicGate.ok) {
    return classificationRecord(article, 'assign_fallback_image', ['missing_public_image']);
  }

  if (publicGate.ok) {
    return classificationRecord(article, 'regenerate_brief', ['public_source_gate_passed']);
  }

  return classificationRecord(article, 'hidden_noindex', publicGate.block_reasons || ['source_gate_failed']);
}

const zeroCounts = () => Object.fromEntries(LEGACY_MIGRATION_ACTIONS.map((action) => [action, 0]));

function exampleKey(record = {}) {
  if (/netapp/i.test(record.title)) return 'NetApp';
  if (/app store|game assistant/i.test(record.title)) return 'AppStoreAI';
  if (/land and expand/i.test(record.title)) return 'LandAndExpand';
  return '';
}

export function buildLegacyMigrationPlan(items = [], options = {}) {
  const auditLimit = Number(options.auditLimit || 200);
  const regenerationLimit = Number(options.regenerationLimit || 100);
  const sourceArticles = items.map((article = {}) => ({ ...article }));
  const classifications = items.slice(0, auditLimit).map(classifyLegacyArticle);
  const counts = zeroCounts();
  const examples = {};

  for (const record of classifications) {
    counts[record.action] += 1;
    const key = exampleKey(record);
    if (key && !examples[key]) examples[key] = record;
  }
  for (const article of items) {
    const record = classifyLegacyArticle(article);
    const key = exampleKey(record);
    if (key && !examples[key]) examples[key] = record;
    if (examples.NetApp && examples.AppStoreAI && examples.LandAndExpand) break;
  }

  const eligible = classifications
    .filter((record) => !['hidden_noindex', 'delete_or_410'].includes(record.action))
    .slice(0, regenerationLimit);

  return {
    generatedAt: new Date().toISOString(),
    auditLimit,
    regenerationLimit,
    counts,
    examples,
    classifications,
    sourceArticles,
    latest100Eligible: eligible,
  };
}

function fallbackPatch(article = {}) {
  const image = fallbackCategoryImagePath(article);
  return {
    heroImage: article.heroImage || image,
    thumbnailImage: article.thumbnailImage || image,
    ogImage: article.ogImage || image,
    generatedImage: article.generatedImage || image,
    imageAlt: article.imageAlt || `${article.title || 'Compute Current'} editorial visual`,
    imageStatus: article.imageStatus || 'fallback',
    generatedImageProvider: article.generatedImageProvider || 'category-fallback',
  };
}

function withRegenerationRequest(article = {}, type = 'article') {
  return {
    ...article,
    ...(!explicitImage(article) ? fallbackPatch(article) : {}),
    public_status: 'draft',
    articlePagePublished: false,
    homepagePublished: false,
    seo_noindex: true,
    noindex: true,
    admin_regeneration_request: {
      type,
      requestedAt: new Date().toISOString(),
      reason: 'legacy_migration',
    },
  };
}

function applyRecord(record = {}) {
  const article = { ...(record.article || {}) };
  if (record.action === 'regenerate_longform') return withRegenerationRequest(article, 'article');
  if (record.action === 'regenerate_brief') return withRegenerationRequest(article, 'brief');
  if (record.action === 'assign_fallback_image') {
    return { ...article, ...fallbackPatch(article), legacy_migration_action: record.action };
  }
  if (record.action === 'hidden_noindex') {
    return {
      ...article,
      public_status: 'hidden',
      hidden: true,
      articlePagePublished: false,
      homepagePublished: false,
      archiveOnly: true,
      seo_noindex: true,
      noindex: true,
      legacy_migration_action: record.action,
      seo_noindex_reasons: ['legacy_hidden_noindex', ...record.reasons],
    };
  }
  return {
    ...article,
    public_status: 'gone',
    gone: true,
    articlePagePublished: false,
    homepagePublished: false,
    archiveOnly: true,
    seo_noindex: true,
    noindex: true,
    legacy_migration_action: record.action,
    rollback_required: true,
    seo_noindex_reasons: ['legacy_delete_or_410', ...record.reasons],
  };
}

function searchRecord(article = {}) {
  return {
    ...article,
    slug: article.slug || article.id,
    searchText: [
      article.title,
      article.source,
      article.primary_category,
      article.infrastructure_layer,
      article.deck,
      article.summary,
      article.snippet,
    ].map(clean).filter(Boolean).join(' '),
  };
}

export function applyLegacyMigrationPlan(plan = {}) {
  const records = Array.isArray(plan.classifications) ? plan.classifications : [];
  const sourceArticles = Array.isArray(plan.sourceArticles)
    ? plan.sourceArticles
    : records.map((record = {}) => ({ ...(record.article || {}) }));
  const recordsById = new Map(records.map((record = {}) => [record.id, record]));
  const updatedArticles = sourceArticles.map((article = {}) => {
    const record = recordsById.get(article.id);
    if (!record) return { ...article };
    return applyRecord({ ...record, article });
  });
  const rollback = sourceArticles.map((article = {}) => {
    const record = recordsById.get(article.id);
    return {
      id: article.id,
      article: { ...article },
      action: record?.action || 'unchanged',
    };
  });
  const publicArticles = updatedArticles.filter((article) => !['hidden', 'gone'].includes(article.public_status));
  const searchIndex = publicArticles.map(searchRecord);
  const rssItems = buildRssItems(publicArticles);
  const sitemapEntries = buildSitemapEntries(publicArticles);
  const taxonomyPages = {
    categories: buildCategoryPages(publicArticles),
    archive: archivePages(publicArticles, 50),
  };

  return {
    updatedArticles,
    rollback,
    searchIndex,
    rssItems,
    sitemapEntries,
    taxonomyPages,
    cacheReport: {
      generatedAt: new Date().toISOString(),
      updatedArtifacts: ['latestNews', 'searchIndex', 'taxonomyPages', 'rssItems', 'sitemapEntries', 'imageAssignments', 'rollback'],
      counts: plan.counts || zeroCounts(),
    },
  };
}
