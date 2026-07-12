import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { exportAdminPublicReadModel } from '../scripts/export-admin-public-read-model.mjs';
import { createLocalAdminStorage } from '../src/plugins/storage/index.mjs';
import { ADMIN_PUBLIC_READ_MODEL_PATH, readAdminPublicReadModel } from '../src/lib/admin-public-read-model.js';
import { mergePublicContentInventory } from '../src/lib/public-content-inventory.js';
import { buildRssItems } from '../scripts/lib/rss-builder.mjs';
import { buildSitemapEntries } from '../scripts/lib/sitemap-builder.mjs';

test('admin publication export makes published records visible and removes unpublished records', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'admin-public-model-'));
  const outputPath = path.join(directory, 'public.json');
  const storage = createLocalAdminStorage({ storageKey: `public-model-${Math.random()}` });
  try {
    await storage.createArticle({
      id: 'public-article',
      title: 'Public article',
      heroImage: '/api/admin/media?id=media-1&articleId=public-article',
      public_status: 'published',
      articlePagePublished: true,
      homepagePublished: true,
      draft: false,
      noindex: false,
      hidden: false,
      publishedAt: '2026-07-12T08:00:00.000Z',
    }, { action: 'publish', actor: 'admin' });
    await storage.createArticle({ id: 'draft-article', title: 'Draft', public_status: 'draft', draft: true }, {
      action: 'create-draft', actor: 'editor',
    });
    await storage.createMedia({
      id: 'media-1',
      articleId: 'public-article',
      objectKey: 'admin-media/public-article/source.webp',
      url: '/api/admin/media?id=media-1&articleId=public-article',
      contentType: 'image/webp',
      byteSize: 128,
      width: 16,
      height: 16,
      checksum: 'a'.repeat(64),
    }, { actor: 'admin' });
    const promotedKeys = [];
    const mediaStorage = {
      async publishImage(objectKey) {
        promotedKeys.push(objectKey);
        return 'https://blob.example/published/public-article.webp';
      },
    };

    const first = await exportAdminPublicReadModel({ storage, mediaStorage, outputPath });
    assert.equal(first.articleCount, 1);
    assert.equal(first.pendingEvents, 2);
    const exported = JSON.parse(await fs.readFile(outputPath, 'utf8'));
    assert.deepEqual(exported.articles.map((article) => article.id), ['public-article']);
    assert.equal(exported.articles[0].heroImage, 'https://blob.example/published/public-article.webp');
    assert.deepEqual(promotedKeys, ['admin-media/public-article/source.webp']);
    assert.equal((await storage.listPublicationOutbox()).length, 2);
    assert.equal((await storage.listPublicationOutbox()).length, 2);

    await storage.updateArticle('public-article', {
      public_status: 'draft', articlePagePublished: false, homepagePublished: false, draft: true,
    }, { expectedVersion: 1, action: 'unpublish', actor: 'admin' });
    const second = await exportAdminPublicReadModel({ storage, mediaStorage, outputPath });
    assert.equal(second.articleCount, 0);
    assert.deepEqual(JSON.parse(await fs.readFile(outputPath, 'utf8')).articles, []);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('admin public read model defaults to ignored runtime storage and fails empty when absent', async () => {
  assert.match(ADMIN_PUBLIC_READ_MODEL_PATH, /[\\/]\.cache[\\/]admin-public-read-model\.json$/);
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'missing-admin-public-model-'));
  try {
    assert.deepEqual(readAdminPublicReadModel(path.join(directory, 'missing.json')), { articles: [], ownedIds: [] });
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('CMS ownership tombstones prevent non-public legacy records from reappearing', () => {
  const merged = mergePublicContentInventory(
    { articles: [{ id: 'cms-public', title: 'CMS public' }], ownedIds: ['cms-public', 'legacy-hidden'] },
    [{ id: 'legacy-hidden', title: 'Legacy fallback' }, { id: 'legacy-public', title: 'Legacy public' }],
    [],
  );
  assert.deepEqual(merged.map((article) => article.id), ['cms-public', 'legacy-public']);
});

test('admin publish and unpublish propagate through sitemap and RSS discovery', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'admin-public-discovery-'));
  const outputPath = path.join(directory, 'public.json');
  const rows = [
    ...JSON.parse(await fs.readFile(new URL('../src/data/latest-news.json', import.meta.url), 'utf8')),
    ...JSON.parse(await fs.readFile(new URL('../src/data/archived-news.json', import.meta.url), 'utf8')),
  ];
  const article = rows.find((row) => row.id === '99520a2a1435cecd');
  assert.ok(article, 'expected the curated longform discovery fixture');
  const storage = createLocalAdminStorage({ storageKey: `public-discovery-${Math.random()}` });
  try {
    await storage.createArticle(article, { action: 'publish', actor: 'admin' });
    await exportAdminPublicReadModel({ storage, outputPath });
    let inventory = mergePublicContentInventory(readAdminPublicReadModel(outputPath), [], []);
    assert.equal(buildSitemapEntries(inventory).some((entry) => entry.loc === `/news/${article.id}/`), true);
    assert.equal(buildRssItems(inventory).some((entry) => entry.link === `/news/${article.id}/`), true);

    await storage.updateArticle(article.id, {
      public_status: 'unpublished',
      articlePagePublished: false,
      homepagePublished: false,
      draft: true,
    }, { expectedVersion: 1, action: 'unpublish', actor: 'admin' });
    await exportAdminPublicReadModel({ storage, outputPath });
    inventory = mergePublicContentInventory(readAdminPublicReadModel(outputPath), [], []);
    assert.equal(inventory.length, 0);
    assert.equal(buildSitemapEntries(inventory).some((entry) => entry.loc === `/news/${article.id}/`), false);
    assert.equal(buildRssItems(inventory).some((entry) => entry.link === `/news/${article.id}/`), false);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
