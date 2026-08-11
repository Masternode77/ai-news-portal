import assert from 'node:assert/strict';
import test from 'node:test';
import { buildHomepageFeed } from '../scripts/lib/homepage-feed-builder.mjs';
import { buildRegionIndex } from '../scripts/lib/region-index.mjs';
import { isPublicProductFit } from '../scripts/lib/public-product-fit.mjs';
import { currentSourceTextAuthorization } from '../scripts/lib/source-text-publication-authorization.mjs';
import { publicTaxonomyItems } from '../scripts/lib/taxonomy-page-builder.mjs';
import {
  authorizedAdminSourceRegistry,
  canonicalAdminArticle,
  canonicalAdminExtractionArtifact,
} from './fixtures/admin-publication-integrity.mjs';

const AUTHORIZATION_OPTIONS = {
  sourceRegistry: authorizedAdminSourceRegistry(),
  now: '2026-08-10T00:00:00.000Z',
};

function eligibleEuropeArticle(overrides = {}) {
  return {
    ...canonicalAdminArticle({ published: true }),
    region: 'Europe',
    archiveOnly: false,
    noindex: false,
    seo_noindex: false,
    public_content_tier: 'signal_card',
    ...overrides,
  };
}

test('region index groups a current authorized source-backed public item', () => {
  // Given: a public record with current extraction provenance, exact source identity, and infrastructure evidence.
  const article = eligibleEuropeArticle();
  const authorization = currentSourceTextAuthorization(article, article.extraction_artifact, AUTHORIZATION_OPTIONS);

  // When: the taxonomy region index receives the record.
  const regions = buildRegionIndex([article]);

  // Then: the fixture has current rights and source-only product fit, and the source index groups it.
  assert.equal(authorization.ok, true);
  assert.equal(authorization.sourceId, article.sourceRegistryId);
  assert.equal(article.extraction_artifact.source_url, article.sourceUrl);
  assert.equal(isPublicProductFit(article), true);
  assert.equal(regions.find((region) => region.slug === 'europe').items.length, 1);
});

test('source-text authorization rejects unregistered and malformed region fixtures', () => {
  // Given: otherwise eligible records with an unregistered identity or malformed source URL.
  const unregistered = eligibleEuropeArticle({ sourceRegistryId: 'missing-source' });
  const malformed = eligibleEuropeArticle({ sourceUrl: 'javascript:alert(1)' });

  // When: current source-text authorization evaluates each record.
  const unregisteredDecision = currentSourceTextAuthorization(unregistered, unregistered.extraction_artifact, AUTHORIZATION_OPTIONS);
  const malformedDecision = currentSourceTextAuthorization(malformed, malformed.extraction_artifact, AUTHORIZATION_OPTIONS);

  // Then: neither fixture can satisfy source-text authorization.
  assert.equal(unregisteredDecision.ok, false);
  assert.equal(malformedDecision.ok, false);
});

test('region source index retains a rights-valid record that public product fit excludes', () => {
  // Given: a rights-valid source record whose evidence is about a consumer device rather than AI infrastructure.
  const consumerEvidence = Array.from({ length: 8 }, (_, index) => (
    `The limited-edition music player includes game-themed controls and a collectible wireless design. Source paragraph ${index + 1} documents the consumer product release.`
  )).join(' ');
  const article = eligibleEuropeArticle({
    title: 'Collector music player announced',
    summary: consumerEvidence,
    articleText: consumerEvidence,
    source_evidence_text: consumerEvidence,
    extraction_artifact: canonicalAdminExtractionArtifact({ cleanedExtractedText: consumerEvidence }),
  });
  const authorization = currentSourceTextAuthorization(article, article.extraction_artifact, AUTHORIZATION_OPTIONS);

  // When: the source taxonomy index and reader-facing eligibility layers process the same record.
  const regions = buildRegionIndex([article]);
  const sourceItems = regions.find((region) => region.slug === 'europe').items;
  const publicTaxonomy = publicTaxonomyItems([article]);
  const rendered = buildHomepageFeed([article], { ...AUTHORIZATION_OPTIONS, limit: 1, minimumVisible: 0 });

  // Then: the source index preserves inventory while public layers fail closed on product fit.
  assert.equal(authorization.ok, true);
  assert.equal(isPublicProductFit(article), false);
  assert.deepEqual(sourceItems.map((item) => item.id), [article.id]);
  assert.deepEqual(publicTaxonomy.map((item) => item.id), []);
  assert.deepEqual(rendered.items.map((item) => item.id), []);
});
