import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyAdminArticleAction,
  buildAdminArticlePreview,
  syncAdminSearchIndex,
  validateAdminPublishQuality,
} from '../scripts/lib/admin-article-store.mjs';
import {
  authorizedAdminSourceRegistry,
  CANONICAL_ADMIN_BODY,
  CANONICAL_ADMIN_SOURCE,
  canonicalAdminArticle,
  canonicalAdminExtractionArtifact,
} from './fixtures/admin-publication-integrity.mjs';

function baseArticle() {
  return {
    ...canonicalAdminArticle(),
    id: 'article-1',
    summary: 'Utility interconnection schedules shape campus commissioning and operating milestones.',
    category: 'Power Grid',
    source: 'GridWire',
    sourceUrl: 'https://example.com/source',
    extraction_artifact: canonicalAdminExtractionArtifact({ sourceUrl: 'https://example.com/source' }),
    publishedAt: '2026-05-20T00:00:00.000Z',
    public_status: 'draft',
    unknownFutureField: { keep: true },
    expertLensFull: {
      finalHeadline: 'Utility milestones shape campus commissioning',
      finalArticleBody: CANONICAL_ADMIN_BODY,
      metaDescription: 'Utility interconnection schedules shape campus commissioning and operating milestones.',
    },
    tags: ['grid'],
  };
}

test('admin save draft edits full article surface without losing unknown fields', () => {
  const result = applyAdminArticleAction({
    article: baseArticle(),
    action: 'save-draft',
    actor: 'owner',
    now: '2026-05-31T06:00:00.000Z',
    patch: {
      title: 'Updated transformer queue',
      dek: 'New decision-support dek',
      bodyMarkdown: 'Updated body for operators and investors with enough detail to preview.',
      category: 'Power Grid',
      tags: 'grid, transformers',
      source: 'GridWire Pro',
      sourceUrl: 'https://example.com/new-source',
      canonicalUrl: 'https://compute-current.test/news/article-1/',
      heroImage: '/generated/articles/article-1/hero.webp',
      thumbnailImage: '/generated/articles/article-1/thumbnail.webp',
      imageAlt: 'Transformer yard serving data center load',
      imagePrompt: 'Editorial infrastructure image prompt',
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.article.public_status, 'draft');
  assert.equal(result.article.title, 'Updated transformer queue');
  assert.equal(result.article.deck, 'New decision-support dek');
  assert.equal(result.article.expertLensFull.finalArticleBody, 'Updated body for operators and investors with enough detail to preview.');
  assert.deepEqual(result.article.tags, ['grid', 'transformers']);
  assert.deepEqual(result.article.unknownFutureField, { keep: true });
  assert.equal(result.article.heroImage, '/generated/articles/article-1/hero.webp');
  assert.equal(result.article.imageAlt, 'Transformer yard serving data center load');
  assert.equal(result.auditEntry.actor, 'owner');
  assert.equal(result.auditEntry.action, 'save-draft');
  assert.ok(result.auditEntry.changedFields.includes('title'));
});

test('admin publish runs quality gate and records review queue failure without mutating public status', () => {
  const blocked = applyAdminArticleAction({
    article: baseArticle(),
    action: 'publish',
    actor: 'owner',
    now: '2026-05-31T06:05:00.000Z',
    patch: {
      title: 'Generic AI infrastructure update',
      dek: 'The issue is no longer demand alone; it is whether the surrounding infrastructure is ready.',
      bodyMarkdown: 'The issue is no longer demand alone; it is whether the surrounding infrastructure is ready.',
    },
  });

  assert.equal(blocked.ok, false);
  assert.equal(blocked.statusCode, 422);
  assert.equal(blocked.article.public_status, 'draft');
  assert.ok(blocked.qualityErrors.some((reason) => reason.includes('banned')));
  assert.equal(blocked.reviewQueue.action, 'publish-blocked');

  const publishable = applyAdminArticleAction({
    article: baseArticle(),
    action: 'publish',
    actor: 'owner',
    now: '2026-05-31T06:06:00.000Z',
    sourceRegistry: authorizedAdminSourceRegistry({ reviewed_at: '2026-05-01T00:00:00.000Z' }),
    patch: {},
  });

  assert.equal(publishable.ok, true);
  assert.equal(publishable.article.public_status, 'published');
  assert.equal(publishable.article.articlePagePublished, true);
  assert.equal(publishable.article.homepagePublished, true);
  assert.equal(publishable.auditEntry.action, 'publish');
});

test('admin publish blocks extraction and source gate failures without mutating public status', () => {
  const cases = [
    {
      name: 'explicit extraction failure',
      article: {
        ...baseArticle(),
        extraction_artifact: canonicalAdminExtractionArtifact({
          extractionQa: { public_publishable: false, can_generate_longform: true, sentence_completion_score: 1 },
        }),
      },
      reason: 'extraction_qa:public_publishable_false',
    },
    {
      name: 'low extraction score',
      article: {
        ...baseArticle(),
        extraction_artifact: canonicalAdminExtractionArtifact({
          extractionQa: { public_publishable: true, can_generate_longform: true, sentence_completion_score: 0.5 },
        }),
      },
      reason: 'extraction_qa:sentence_completion_score_below_0.92',
    },
    {
      name: 'failed public extraction result',
      article: {
        ...baseArticle(),
        extraction_artifact: canonicalAdminExtractionArtifact({
          extractionQa: { public_publishable: true, can_generate_longform: false, sentence_completion_score: 1 },
        }),
      },
      reason: 'extraction_qa:can_generate_longform_not_true',
    },
    {
      name: 'public source gate failure',
      article: {
        ...baseArticle(),
        source_evidence_text: 'Want more Data Center Knowledge stories? Sign up for our newsletter. Copyright 2026 TechTarget, Inc. Registered in England and Wales.',
        articleText: 'Want more Data Center Knowledge stories? Sign up for our newsletter. Copyright 2026 TechTarget, Inc. Registered in England and Wales.',
        extraction_artifact: canonicalAdminExtractionArtifact({
          cleanedExtractedText: 'Want more Data Center Knowledge stories? Sign up for our newsletter. Copyright 2026 TechTarget, Inc. Registered in England and Wales.',
        }),
      },
      reason: 'article_detail:source_extraction:',
    },
  ];

  for (const item of cases) {
    const blocked = applyAdminArticleAction({
      article: item.article,
      action: 'publish',
      actor: 'owner',
      now: '2026-05-31T06:07:00.000Z',
      patch: {
        title: `${item.name} should not publish`,
        dek: 'A concrete infrastructure source gate failure keeps this draft out of the public surface.',
        bodyMarkdown: CANONICAL_ADMIN_BODY,
      },
    });

    assert.equal(blocked.ok, false, item.name);
    assert.equal(blocked.statusCode, 422, item.name);
    assert.equal(blocked.article.public_status, 'draft', item.name);
    assert.equal(blocked.attemptedArticle.public_status, 'published', item.name);
    assert.ok(blocked.qualityErrors.some((reason) => reason.startsWith(item.reason)), item.name);
    assert.ok(blocked.reviewQueue.reasons.some((reason) => reason.startsWith(item.reason)), item.name);
  }
});

test('admin extraction publish gates do not block non-publish actions', () => {
  const result = applyAdminArticleAction({
    article: { ...baseArticle(), extraction_failed: true, public_extraction_passed: false },
    action: 'save-draft',
    actor: 'owner',
    now: '2026-05-31T06:08:00.000Z',
    patch: { title: 'Draft can keep failed source metadata' },
  });

  assert.equal(result.ok, true);
  assert.equal(result.statusCode, 200);
  assert.equal(result.article.public_status, 'draft');
  assert.equal(result.article.title, 'Draft can keep failed source metadata');
});

test('admin actions cover hide, noindex, image replacement, and preview', () => {
  const hidden = applyAdminArticleAction({ article: baseArticle(), action: 'hide', actor: 'owner' });
  assert.equal(hidden.article.public_status, 'hidden');
  assert.equal(hidden.article.noindex, true);

  const noindex = applyAdminArticleAction({ article: baseArticle(), action: 'noindex', actor: 'owner' });
  assert.equal(noindex.article.public_status, 'noindex');
  assert.equal(noindex.article.seo_noindex, true);

  const upload = applyAdminArticleAction({
    article: baseArticle(),
    action: 'upload-image',
    actor: 'owner',
    patch: { replacementImage: '/uploads/manual.webp', imageAlt: 'Manual replacement' },
  });
  assert.equal(upload.article.heroImage, '/uploads/manual.webp');
  assert.equal(upload.article.thumbnailImage, '/uploads/manual.webp');
  assert.equal(upload.article.imageAlt, 'Manual replacement');

  const preview = buildAdminArticlePreview(upload.article);
  assert.match(preview.html, /Utility milestones shape campus commissioning/);
  assert.match(preview.html, /Manual replacement/);
});

test('admin upload action whitelists fields and keeps publication status action-owned', () => {
  // Given: a draft and a payload containing fields that belong to another action.
  const article = baseArticle();

  // When: an image replacement is requested with copy and status fields mixed in.
  const uploaded = applyAdminArticleAction({
    article,
    action: 'upload-image',
    actor: 'owner',
    patch: {
      title: 'Injected headline',
      bodyMarkdown: 'Injected body',
      public_status: 'published',
      status: 'published',
      replacementImage: '/uploads/replacement.webp',
    },
  });

  // Then: only fields owned by upload-image change.
  assert.equal(uploaded.ok, true);
  assert.equal(uploaded.article.title, article.title);
  assert.equal(uploaded.article.expertLensFull.finalArticleBody, article.expertLensFull.finalArticleBody);
  assert.equal(uploaded.article.public_status, 'draft');
  assert.equal(uploaded.article.heroImage, '/uploads/replacement.webp');
});

test('admin store rejects regeneration actions that have no runtime consumer', () => {
  // Given: the shipped editor action boundary.
  const article = baseArticle();

  // When/Then: every unconsumed regeneration variant is rejected without mutation.
  for (const action of ['regenerate-article', 'regenerate-brief', 'regenerate-image', 'edit-prompt']) {
    const result = applyAdminArticleAction({ article, action, patch: { imagePrompt: 'Unused request' } });
    assert.equal(result.ok, false, action);
    assert.equal(result.statusCode, 400, action);
    assert.deepEqual(result.qualityErrors, ['unsupported_action'], action);
    assert.deepEqual(result.article, article, action);
  }
});

test('public articles run the complete copy gate for alternate image actions', () => {
  // Given: an already-public article whose copy is no longer publishable.
  const article = {
    ...baseArticle(),
    public_status: 'published',
    articlePagePublished: true,
    homepagePublished: true,
    title: 'Bad',
    articleText: 'Too short',
    expertLensFull: { ...baseArticle().expertLensFull, finalHeadline: 'Bad', finalArticleBody: 'Too short' },
  };

  // When: alternate image actions would leave it public.
  const noindex = applyAdminArticleAction({ article, action: 'noindex' });
  const replace = applyAdminArticleAction({ article, action: 'upload-image', patch: { replacementImage: '/uploads/new.webp' } });

  // Then: both writes fail closed through the public-copy gate.
  assert.equal(noindex.ok, false);
  assert.equal(replace.ok, false);
  assert.ok(noindex.qualityErrors.includes('article_detail:visible_body_below_4500'));
  assert.ok(replace.qualityErrors.includes('article_detail:visible_body_below_4500'));
  assert.equal(noindex.article.public_status, article.public_status);
  assert.equal(replace.article.heroImage, article.heroImage);
});

test('preview is non-mutating and cannot change status', () => {
  // Given: a draft source object.
  const article = baseArticle();
  const before = structuredClone(article);

  // When: preview receives edited copy and a forged status.
  const result = applyAdminArticleAction({
    article,
    action: 'preview',
    patch: { title: 'Preview headline', public_status: 'published' },
  });

  // Then: the source stays byte-for-byte equivalent and preview status remains draft.
  assert.deepEqual(article, before);
  assert.equal(result.article.public_status, 'draft');
  assert.match(result.preview.html, /Preview headline/);
});

test('admin save updates search index deterministically', () => {
  const result = applyAdminArticleAction({
    article: baseArticle(),
    action: 'save-draft',
    actor: 'owner',
    patch: { title: 'Search updated title', tags: ['grid', 'queue'] },
  });
  const search = syncAdminSearchIndex([{ id: 'other', title: 'Other' }, { id: 'article-1', title: 'Old' }], result.article);

  assert.equal(search.length, 2);
  assert.equal(search[1].title, 'Search updated title');
  assert.match(search[1].searchText, /Search updated title/);
  assert.match(search[1].searchText, /queue/);
});

test('publish quality validator allows draft bypass but blocks public banned copy', () => {
  assert.deepEqual(validateAdminPublishQuality({ public_status: 'draft' }), []);
  const errors = validateAdminPublishQuality({
    title: 'Bad',
    summary: 'This signal matters',
    public_status: 'published',
    articlePagePublished: true,
    articleText: CANONICAL_ADMIN_SOURCE,
    source_evidence_text: CANONICAL_ADMIN_SOURCE,
    expertLensFull: { finalArticleBody: 'This signal matters' },
  });
  assert.ok(errors.length > 0);
});
