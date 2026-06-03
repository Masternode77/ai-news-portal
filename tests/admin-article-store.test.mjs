import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyAdminArticleAction,
  buildAdminArticlePreview,
  syncAdminSearchIndex,
  validateAdminPublishQuality,
} from '../scripts/lib/admin-article-store.mjs';

function baseArticle() {
  return {
    id: 'article-1',
    title: 'Original headline',
    summary: 'Original dek',
    category: 'Power Grid',
    source: 'GridWire',
    sourceUrl: 'https://example.com/source',
    publishedAt: '2026-05-20T00:00:00.000Z',
    public_status: 'draft',
    extraction_quality_score: 0.91,
    articleText: 'Utility planners said a 300 MW data center campus is waiting on substation delivery and a signed interconnection agreement. The developer identified phased capacity, expected service dates, and local permitting work. Power equipment suppliers are named as the limiting factor for the first two halls. The source links the capacity plan to AI training demand and cloud customer reservations. County filings describe water, grid, and road upgrades that must land before the campus opens. Operators are watching transformer delivery windows and interconnection studies before treating the campus timeline as firm.',
    unknownFutureField: { keep: true },
    expertLensFull: {
      finalHeadline: 'Original headline',
      finalArticleBody: 'Original body with enough substance for a private draft.',
      metaDescription: 'Original meta',
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
    patch: {
      title: 'Transformer interconnect queue tightens',
      dek: 'Grid interconnection timing is becoming the binding constraint for a planned accelerator campus.',
      bodyMarkdown: 'A utility queue change gives operators a concrete signal to watch: transformer delivery windows and interconnection studies now decide whether the accelerator campus can energize on schedule.',
    },
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
      article: { ...baseArticle(), extraction_failed: true },
      reason: 'extraction_failed',
    },
    {
      name: 'low extraction score',
      article: { ...baseArticle(), extraction_quality_score: 0.49 },
      reason: 'extraction_quality_score_below_0.5',
    },
    {
      name: 'failed public extraction result',
      article: { ...baseArticle(), public_extraction_passed: false },
      reason: 'public_extraction_failed',
    },
    {
      name: 'public source gate failure',
      article: {
        ...baseArticle(),
        articleText: 'Want more Data Center Knowledge stories? Sign up for our newsletter. Copyright 2026 TechTarget, Inc. Registered in England and Wales.',
      },
      reason: 'public_source_gate_failed',
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
        bodyMarkdown: 'A concrete infrastructure source gate failure keeps this draft out of the public surface until extraction evidence is clean enough for operators, investors, and cloud capacity teams to rely on the article.',
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

test('admin actions cover hide, noindex, regenerate, image replacement, and preview', () => {
  const hidden = applyAdminArticleAction({ article: baseArticle(), action: 'hide', actor: 'owner' });
  assert.equal(hidden.article.public_status, 'hidden');
  assert.equal(hidden.article.noindex, true);

  const noindex = applyAdminArticleAction({ article: baseArticle(), action: 'noindex', actor: 'owner' });
  assert.equal(noindex.article.public_status, 'noindex');
  assert.equal(noindex.article.seo_noindex, true);

  const regenerate = applyAdminArticleAction({
    article: baseArticle(),
    action: 'regenerate-image',
    actor: 'owner',
    patch: { imagePrompt: 'New image direction' },
  });
  assert.equal(regenerate.article.admin_regeneration_request.type, 'image');
  assert.equal(regenerate.article.imagePrompt, 'New image direction');

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
  assert.match(preview.html, /Original headline/);
  assert.match(preview.html, /Manual replacement/);
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
  assert.deepEqual(validateAdminPublishQuality({ public_status: 'draft' }, { action: 'save-draft' }), []);
  const errors = validateAdminPublishQuality({
    title: 'Bad',
    summary: 'This signal matters',
    expertLensFull: { finalArticleBody: 'This signal matters' },
  }, { action: 'publish' });
  assert.ok(errors.length > 0);
});
