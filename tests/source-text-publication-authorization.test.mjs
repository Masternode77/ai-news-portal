import assert from 'node:assert/strict';
import test from 'node:test';
import { createExtractionArtifact } from '../scripts/lib/extraction-artifact.mjs';
import { finalPublicationIntegrityResult } from '../scripts/lib/final-publication-integrity.mjs';
import { buildHomepageFeed } from '../scripts/lib/homepage-feed-builder.mjs';
import { runPublishCycle } from '../scripts/lib/publish-cycle.mjs';
import { buildRssItems } from '../scripts/lib/rss-builder.mjs';
import { buildSitemapEntries } from '../scripts/lib/sitemap-builder.mjs';
import {
  authorizedAdminSourceRegistry,
  canonicalAdminArticle,
} from './fixtures/admin-publication-integrity.mjs';

const NOW = '2026-08-10T00:00:00.000Z';

test('final publication boundary reauthorizes immutable source text against the current registry', () => {
  // Given: one valid article and current, denied, expired, mismatched, and absent registry states.
  const article = canonicalAdminArticle({ published: true });
  const cases = [
    { name: 'unregistered', registry: [], expected: 'source_not_registered' },
    { name: 'missing registry', registry: null, expected: 'registry_unreadable' },
    { name: 'disabled', registry: authorizedAdminSourceRegistry({ allow_text_use: false }), expected: 'authorization_disabled' },
    { name: 'expired', registry: authorizedAdminSourceRegistry({ reviewed_at: '2024-01-01T00:00:00.000Z' }), expected: 'rights_review_expired' },
    { name: 'inactive', registry: authorizedAdminSourceRegistry({ status: 'blocked' }), expected: 'source_inactive' },
    { name: 'registry URL mismatch', registry: authorizedAdminSourceRegistry({ domain: 'other.example' }), expected: 'article_source_domain_mismatch' },
    { name: 'registry ID mismatch', registry: authorizedAdminSourceRegistry(), article: { ...article, sourceRegistryId: 'wrong-source' }, expected: 'source_not_registered' },
    { name: 'malformed provenance', registry: authorizedAdminSourceRegistry(), article: { ...article, sourceUrl: 'javascript:alert(1)' }, expected: 'article_source_url_malformed' },
  ];

  // When: each candidate crosses the final boundary using an explicit current registry snapshot.
  for (const item of cases) {
    const result = finalPublicationIntegrityResult(item.article || article, [], { sourceRegistry: item.registry, now: NOW });

    // Then: every non-current authorization fails closed with a machine-readable reason.
    assert.equal(result.ok, false, `${item.name} source was accepted`);
    assert.ok(result.reasons.includes(`source_rights:${item.expected}`), JSON.stringify(result.reasons));
  }

  const valid = finalPublicationIntegrityResult(article, [], {
    sourceRegistry: authorizedAdminSourceRegistry(),
    now: NOW,
  });
  assert.equal(valid.ok, true, JSON.stringify(valid.reasons));
  assert.equal(valid.checks.sourceRights.sourceId, 'authorized-test-source');
  assert.equal(valid.checks.sourceRights.reviewedAt, '2026-08-09T00:00:00.000Z');
  assert.match(valid.checks.sourceRights.registryDigest, /^[a-f0-9]{64}$/);
  assert.equal(valid.checks.sourceRights.contentDigest, article.extraction_artifact.extracted_text_sha256);
});

test('scheduled publication uses the same current source-text authorization boundary', async () => {
  // Given: one publication-ready routed article and current versus revoked registry states.
  const article = canonicalAdminArticle();
  const routeArticle = async () => ({
    id: article.id,
    title: article.title,
    tier: 'longform_analysis',
    coreFeedEligible: true,
    detailPage: true,
    finalArticleBody: article.expertLensFull.finalArticleBody,
    brief: article.summary,
    reasons: [],
    relevance: { score: 0.91, visibility: 'core', laneKey: 'power-grid' },
  });

  // When: the scheduled path evaluates the same article under both registry states.
  const authorized = await runPublishCycle({ articles: [article], routeArticle, sourceRegistry: authorizedAdminSourceRegistry(), now: NOW });
  const revoked = await runPublishCycle({ articles: [article], routeArticle, sourceRegistry: authorizedAdminSourceRegistry({ allow_text_use: false }), now: NOW });

  // Then: current authorization publishes once, while revocation emits no public record.
  assert.equal(authorized.summary.published, 1, JSON.stringify(authorized.artifacts.adminReviewQueue));
  assert.equal(authorized.artifacts.latestNews[0].publication_integrity.source_text_authorization.sourceId, 'authorized-test-source');
  assert.equal(revoked.summary.published, 0);
  assert.equal(revoked.artifacts.latestNews.some((item) => item.id === article.id), false);
});

test('final publication boundary rejects article and extraction-artifact provenance mismatch', () => {
  // Given: a hash-valid artifact whose URL does not equal the article provenance URL.
  const article = canonicalAdminArticle({ published: true });
  const mismatched = {
    ...article,
    extraction_artifact: createExtractionArtifact({
      sourceUrl: 'https://example.com/different-source',
      cleanedExtractedText: article.extraction_artifact.cleaned_extracted_text,
      extractionQa: article.extraction_artifact.extraction_qa,
    }),
  };

  // When: the final boundary evaluates the provenance-bearing artifact.
  const result = finalPublicationIntegrityResult(mismatched, [], {
    sourceRegistry: authorizedAdminSourceRegistry(),
    now: NOW,
  });

  // Then: matching publisher domains cannot disguise a different source URL.
  assert.equal(result.ok, false);
  assert.ok(result.reasons.includes('source_rights:article_artifact_url_mismatch'));
});

test('public source authorization rejects incomplete extraction artifacts before card publication', () => {
  // Given: otherwise public source briefs with incomplete, corrupted, or failed artifacts.
  const valid = canonicalAdminArticle({ published: true });
  const artifact = valid.extraction_artifact;
  const cases = [
    { name: 'bare URL', artifact: { source_url: artifact.source_url } },
    { name: 'unsupported version', artifact: { ...artifact, artifact_version: 'legacy' } },
    { name: 'empty text', artifact: { ...artifact, cleaned_extracted_text: '' } },
    { name: 'hash mismatch', artifact: { ...artifact, extracted_text_sha256: '0'.repeat(64) } },
    { name: 'failed QA', artifact: { ...artifact, extraction_qa: { ...artifact.extraction_qa, public_publishable: false } } },
    { name: 'length mismatch', artifact: { ...artifact, extraction_qa: { ...artifact.extraction_qa, cleaned_source_length: 1 } } },
    { name: 'blocked QA', artifact: { ...artifact, extraction_qa: { ...artifact.extraction_qa, block_reasons: ['truncated'] } } },
    { name: 'URL mismatch', artifact: { ...artifact, source_url: 'https://example.com/other-source' } },
  ];

  for (const item of cases) {
    const article = {
      ...valid,
      articlePagePublished: false,
      public_content_tier: 'signal_card',
      extraction_artifact: item.artifact,
    };

    // When: the direct public-card builder reauthorizes each record.
    const feed = buildHomepageFeed([article], {
      sourceRegistry: authorizedAdminSourceRegistry(),
      now: NOW,
      limit: 1,
      minimumVisible: 0,
    });

    // Then: none can substitute for complete immutable extraction evidence.
    assert.deepEqual(feed.items, [], item.name);
  }
});

test('revoked existing publication is removed before every derived public surface', async () => {
  // Given: a previously valid persisted article whose source authorization is now revoked.
  const article = { ...canonicalAdminArticle({ published: true }), publishedAt: '2026-08-09T00:00:00.000Z' };
  const sourceRegistry = authorizedAdminSourceRegistry({ allow_text_use: false });
  const options = { sourceRegistry, now: NOW };

  // When: the scheduled merge and direct public builders reevaluate current rights.
  const scheduled = await runPublishCycle({
    articles: [],
    routeArticle: async () => null,
    existing: { latestNews: [article], searchIndex: [article] },
    ...options,
  });
  const homepage = buildHomepageFeed([article], { limit: 1, minimumVisible: 0, ...options });
  const rss = buildRssItems([article], options);
  const sitemap = buildSitemapEntries([article], options);

  // Then: the input remains recoverable, while persisted public projections remove it.
  assert.equal(article.public_status, 'published');
  assert.equal(scheduled.artifacts.latestNews.some((item) => item.id === article.id), false);
  assert.equal(scheduled.artifacts.searchIndex.some((item) => item.id === article.id), false);
  assert.equal(scheduled.artifacts.rssItems.length, 0);
  assert.equal(scheduled.artifacts.sitemapEntries.some((entry) => entry.loc === `/news/${article.id}/`), false);
  assert.equal(homepage.items.length, 0);
  assert.equal(rss.length, 0);
  assert.equal(sitemap.some((entry) => entry.loc === `/news/${article.id}/`), false);
});
