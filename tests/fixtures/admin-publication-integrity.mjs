import { createExtractionArtifact } from '../../scripts/lib/extraction-artifact.mjs';
import { safeHttpUrl } from '../../scripts/lib/normalize.mjs';

const CANONICAL_ADMIN_SECTION = [
  'Utility interconnection schedules create a controlling constraint for campus commissioning, so operators need verified transformer delivery before changing deployment plans.',
  'Capacity buyers benefit when customer commitments align with energization timing, while developers remain exposed when infrastructure dependencies move the construction calendar.',
  'Procurement teams should reserve equipment only after utility milestones and service agreements support a credible opening window for the planned compute campus.',
  'Investors should watch substation construction and transformer delivery because those milestones determine when committed demand can become usable infrastructure capacity.',
  'Operators need commissioning evidence across power equipment, cooling readiness, and network delivery before changing supplier allocation or rack deployment assumptions.',
  'The skeptical case is that customer commitments describe demand without proving practical availability of power capacity for the campus operating schedule.',
  'Developers carry schedule exposure when utility agreements, transformer delivery, or commissioning milestones remain conditional instead of contractually fixed.',
  'The next decision point is a verified interconnection milestone that changes the campus operating calendar and supports customer capacity commitments.',
].join('\n\n');

export const CANONICAL_ADMIN_BODY = Array.from({ length: 5 }, (_, index) => [
  `Decision Evidence ${index + 1}`,
  CANONICAL_ADMIN_SECTION,
].join('\n\n')).join('\n\n');

export const CANONICAL_ADMIN_SOURCE = Array.from({ length: 16 }, (_, index) => (
  `Utility evidence ${String.fromCharCode(65 + index)} documents interconnection schedules, transformer delivery, customer commitments, substation construction, campus commissioning, cooling readiness, network delivery, procurement plans, capacity availability, capacity buyers, developer exposure, operating milestones, service agreements, credible opening windows, compute campus plans, supplier allocation, rack deployment, energization timing, infrastructure dependencies, construction calendars, buyer benefits, and schedule alignment.`
)).join(' ');

export function canonicalAdminExtractionArtifact({
  sourceUrl = 'https://example.com/canonical-admin-source',
  cleanedExtractedText = CANONICAL_ADMIN_SOURCE,
  extractionQa = { public_publishable: true, can_generate_longform: true, sentence_completion_score: 1 },
} = {}) {
  return createExtractionArtifact({
    sourceUrl,
    cleanedExtractedText,
    extractionQa,
  });
}

export function canonicalAdminArticle({ published = false } = {}) {
  return {
    id: 'canonical-admin-article',
    title: 'Utility milestones shape campus commissioning',
    summary: 'Utility interconnection schedules shape campus commissioning and operating milestones.',
    public_status: published ? 'published' : 'draft',
    draft: !published,
    articlePagePublished: published,
    homepagePublished: published,
    extraction_quality_score: 0.9,
    infrastructure_relevance_score: 0.91,
    sourceRegistryId: 'authorized-test-source',
    sourceUrl: 'https://example.com/canonical-admin-source',
    source_evidence_text: CANONICAL_ADMIN_SOURCE,
    articleText: CANONICAL_ADMIN_SOURCE,
    extraction_artifact: canonicalAdminExtractionArtifact(),
    claim_ledger: [],
    public_routing: { visibility: 'core', score: 0.91, laneKey: 'power-grid' },
    expertLensFull: {
      finalHeadline: 'Utility milestones shape campus commissioning',
      finalArticleBody: CANONICAL_ADMIN_BODY,
      metaDescription: 'Utility interconnection schedules shape campus commissioning and operating milestones.',
    },
  };
}

export function authorizedAdminSourceRegistry(overrides = {}) {
  return [{
    id: 'authorized-test-source',
    name: 'Authorized Test Source',
    domain: 'example.com',
    feed: 'https://example.com/feed',
    status: 'active_feed',
    text_use_basis: 'licensed',
    image_use_basis: 'unreviewed',
    terms_url: 'https://example.com/terms',
    reviewed_at: '2026-08-09T00:00:00.000Z',
    allow_text_use: true,
    allow_image_reuse: false,
    ...overrides,
  }];
}

export function authorizePublicTestRecords(records = [], now = '2026-08-10T00:00:00.000Z') {
  const fallbackEvidence = 'Verified source evidence documents data center power capacity, utility interconnection schedules, transformer delivery, cooling readiness, network procurement, customer commitments, campus commissioning, supplier exposure, and operating milestones for infrastructure planners. '.repeat(8);
  const sources = new Map();
  const authorizedRecords = records.map((article, index) => {
    const existingUrl = safeHttpUrl(article.sourceUrl || article.url || article.link);
    if ((article.sourceUrl || article.url || article.link) && !existingUrl) return { ...article };
    const sourceUrl = existingUrl || `https://fixture.example/${article.id || index}`;
    const host = new URL(sourceUrl).hostname.toLowerCase().replace(/^www\./, '');
    const sourceRegistryId = `fixture-${host.replace(/[^a-z0-9]+/g, '-')}`;
    const text = String(article.articleText || article.rawText || fallbackEvidence);
    sources.set(sourceRegistryId, {
      id: sourceRegistryId,
      name: article.source || host,
      domain: host,
      feed: `https://${host}/feed`,
      status: 'active_feed',
      text_use_basis: 'licensed',
      image_use_basis: 'unreviewed',
      terms_url: `https://${host}/terms`,
      reviewed_at: '2026-01-01T00:00:00.000Z',
      allow_text_use: true,
      allow_image_reuse: false,
    });
    return {
      ...article,
      sourceRegistryId,
      sourceUrl,
      articleText: article.articleText || article.rawText || fallbackEvidence,
      extraction_artifact: createExtractionArtifact({
        sourceUrl,
        cleanedExtractedText: text,
        extractionQa: { public_publishable: true, can_generate_longform: true, sentence_completion_score: 1 },
      }),
    };
  });
  return { records: authorizedRecords, options: { sourceRegistry: [...sources.values()], now } };
}
