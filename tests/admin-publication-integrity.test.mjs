import assert from 'node:assert/strict';
import test from 'node:test';
import { applyAdminArticleAction } from '../scripts/lib/admin-article-store.mjs';
import {
  authorizedAdminSourceRegistry,
  CANONICAL_ADMIN_BODY,
  canonicalAdminArticle,
  canonicalAdminExtractionArtifact,
} from './fixtures/admin-publication-integrity.mjs';

function adversarialCases() {
  return [
    {
      name: 'copied-source overlap',
      article: {
        ...canonicalAdminArticle(),
        source_evidence_text: CANONICAL_ADMIN_BODY,
        articleText: CANONICAL_ADMIN_BODY,
        extraction_artifact: canonicalAdminExtractionArtifact({ cleanedExtractedText: CANONICAL_ADMIN_BODY }),
      },
      reason: 'copyright:',
      recentRecords: [],
    },
    {
      name: 'fabricated unsupported claim',
      article: {
        ...canonicalAdminArticle(),
        expertLensFull: {
          finalHeadline: 'Utility milestones shape campus commissioning',
          finalArticleBody: `An orbital refinery guarantees interplanetary fuel exports and lunar commodity clearing for sovereign buyers.\n\n${CANONICAL_ADMIN_BODY}`,
        },
      },
      reason: 'source_fidelity:',
      recentRecords: [],
    },
    {
      name: 'repeated structure',
      article: canonicalAdminArticle(),
      reason: 'repetition:',
      recentRecords: [{ ...canonicalAdminArticle({ published: true }), id: 'recent-copy', publishedAt: '2026-08-08T00:00:00.000Z' }],
    },
    {
      name: 'malformed and unledgered numeric claims',
      article: {
        ...canonicalAdminArticle(),
        expertLensFull: { finalHeadline: 'Utility milestones shape campus commissioning', finalArticleBody: `The campus will receive 999MW of capacity and 12,34 MW in reserve.\n\n${CANONICAL_ADMIN_BODY}` },
      },
      reason: 'unsupported_claim:unsupported_numeric_claims:',
      recentRecords: [],
    },
    {
      name: 'legacy missing immutable source evidence',
      article: { ...canonicalAdminArticle(), extraction_artifact: undefined },
      reason: 'extraction_artifact:missing_or_invalid',
      recentRecords: [],
    },
  ];
}

test('admin publish and alternate public mutations reject every canonical integrity failure mode', () => {
  // Given: candidates that independently violate each shared final-publication gate.
  for (const item of adversarialCases()) {
    const draft = { ...item.article, public_status: 'draft', draft: true, articlePagePublished: false, homepagePublished: false };
    const published = { ...item.article, public_status: 'published', draft: false, articlePagePublished: true, homepagePublished: true };

    // When: the admin publishes the draft or mutates an already-public image request.
    const publish = applyAdminArticleAction({ article: draft, action: 'publish', recentRecords: item.recentRecords });
    const alternate = applyAdminArticleAction({ article: published, action: 'upload-image', patch: { replacementImage: '/uploads/new.webp' }, recentRecords: item.recentRecords });

    // Then: both paths fail closed with the shared boundary's reason.
    assert.equal(publish.ok, false, `publish accepted ${item.name}`);
    assert.equal(alternate.ok, false, `alternate action accepted ${item.name}`);
    assert.ok(publish.qualityErrors.some((reason) => reason.startsWith(item.reason)), `publish omitted ${item.name}`);
    assert.ok(alternate.qualityErrors.some((reason) => reason.startsWith(item.reason)), `alternate omitted ${item.name}`);
  }
});

test('valid canonical-artifact content passes publish and alternate public mutation', () => {
  // Given: content that satisfies the canonical final-publication artifact contract.
  const draft = canonicalAdminArticle();
  const published = canonicalAdminArticle({ published: true });
  assert.ok(CANONICAL_ADMIN_BODY.length >= 4500);
  assert.match(draft.extraction_artifact.extracted_text_sha256, /^[a-f0-9]{64}$/);

  // When: it crosses both admin public-write paths.
  const sourceRegistry = authorizedAdminSourceRegistry();
  const now = '2026-08-10T00:00:00.000Z';
  const publish = applyAdminArticleAction({ article: draft, action: 'publish', sourceRegistry, now });
  const alternate = applyAdminArticleAction({ article: published, action: 'upload-image', patch: { replacementImage: '/uploads/canonical.webp' }, sourceRegistry, now });

  // Then: both actions succeed and record the shared integrity snapshot.
  assert.equal(publish.ok, true);
  assert.equal(alternate.ok, true);
  assert.equal(publish.article.publication_integrity.ok, true);
  assert.equal(alternate.article.publication_integrity.ok, true);
  assert.equal(publish.article.publication_integrity.source_text_authorization.sourceId, 'authorized-test-source');
  assert.equal(publish.article.publication_integrity.source_text_authorization.checkedAt, now);
  assert.equal(publish.article.publication_integrity.source_text_authorization.termsUrl, 'https://example.com/terms');
  assert.match(publish.article.publication_integrity.source_text_authorization.registryDigest, /^[a-f0-9]{64}$/);
  assert.equal(
    publish.article.publication_integrity.source_text_authorization.contentDigest,
    draft.extraction_artifact.extracted_text_sha256,
  );
});

test('admin publish rejects unregistered source text without mutating the stored article', () => {
  // Given: a valid draft body whose source has no current registry authorization.
  const article = canonicalAdminArticle();
  const before = structuredClone(article);

  // When: admin publish crosses the same final boundary with an empty registry.
  const result = applyAdminArticleAction({
    article,
    action: 'publish',
    sourceRegistry: [],
    now: '2026-08-10T00:00:00.000Z',
  });

  // Then: the attempted publication fails before any stored/audit mutation can be committed.
  assert.equal(result.ok, false);
  assert.equal(result.statusCode, 422);
  assert.ok(result.qualityErrors.includes('source_rights:source_not_registered'));
  assert.deepEqual(article, before);
  assert.deepEqual(result.article, before);
  assert.equal(result.auditEntry, undefined);
});

test('preview remains non-mutating even when public copy would fail final integrity', () => {
  // Given: a public article whose immutable source evidence is missing.
  const article = { ...canonicalAdminArticle({ published: true }), extraction_artifact: undefined };
  const before = structuredClone(article);

  // When: the admin requests a preview.
  const preview = applyAdminArticleAction({ article, action: 'preview', patch: { title: 'Preview-only title' } });

  // Then: no stored object or publication status changes.
  assert.equal(preview.ok, true);
  assert.deepEqual(article, before);
  assert.equal(preview.article.public_status, 'published');
  assert.match(preview.preview.html, /Preview-only title/);
});
