import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { buildArticleImagePrompt, articleImageAltText } from '../scripts/lib/article-image-prompt.mjs';
import { generateArticleImageSet, metadataPatchFromImageSet } from '../scripts/lib/image2-provider.mjs';
import { createImageProvider, describeImageProvider } from '../scripts/lib/image-providers/index.mjs';

function fixtureArticle(overrides = {}) {
  return {
    id: 'image2-fixture-001',
    title: 'Utility queue forces new AI campus timing',
    source: 'Data Center Dynamics',
    primary_category: 'Power & Grid',
    infrastructure_layer: 'power',
    region: 'US',
    story_archetype: 'constraint analysis',
    editorial_tone: 'operator brief',
    named_entities: ['Dominion Energy', 'Northern Virginia'],
    summary: 'Grid interconnection queues are changing data center build schedules.',
    ...overrides,
  };
}

test('image2 is the canonical configured image provider', () => {
  const provider = createImageProvider('image2');
  const description = describeImageProvider('image2');

  assert.equal(provider.name, 'image2');
  assert.equal(description.requested, 'image2');
  assert.equal(description.active, 'image2');
  assert.equal(description.configured, true);
});

test('article image prompt uses infrastructure-specific story inputs', () => {
  const article = fixtureArticle();
  const prompt = buildArticleImagePrompt(article);

  assert.match(prompt, /Utility queue forces new AI campus timing/);
  assert.match(prompt, /Power & Grid/);
  assert.match(prompt, /power/);
  assert.match(prompt, /Dominion Energy/);
  assert.match(prompt, /Northern Virginia/);
  assert.match(prompt, /constraint analysis/);
  assert.match(prompt, /operator brief/);
  assert.match(prompt, /no logos/i);
  assert.equal(articleImageAltText(article), 'Editorial image for Utility queue forces new AI campus timing');
});

test('offline image2 generation writes metadata and canonical fallback variants', async () => {
  const publicDir = fs.mkdtempSync(path.join(os.tmpdir(), 'compute-current-image2-'));
  const result = await generateArticleImageSet(fixtureArticle(), {
    offline: true,
    publicDir,
    now: () => new Date('2026-05-31T00:00:00.000Z'),
  });
  const patch = metadataPatchFromImageSet(result);

  assert.equal(result.provider, 'image2');
  assert.equal(result.model, 'gpt-image-2');
  assert.equal(result.status, 'fallback');
  assert.match(result.error, /offline/i);
  assert.equal(result.generatedAt, '2026-05-31T00:00:00.000Z');
  assert.match(result.prompt, /data center|grid|power/i);
  assert.match(result.alt, /Utility queue/);
  assert.match(result.heroImage, /^\/generated\/articles\/image2-fixture-001-utility-queue-forces-new-ai-campus-timing\/hero\.svg$/);
  assert.match(result.thumbnailImage, /\/thumbnail\.svg$/);
  assert.match(result.ogImage, /\/og\.svg$/);
  assert.match(result.legacyImage, /^\/generated\/image2-fixture-001\.svg$/);

  for (const imagePath of [result.heroImage, result.thumbnailImage, result.ogImage, result.legacyImage]) {
    assert.equal(fs.existsSync(path.join(publicDir, imagePath.replace(/^\//, ''))), true, `${imagePath} should exist`);
  }

  assert.equal(patch.generatedImage, result.heroImage);
  assert.equal(patch.heroImage, result.heroImage);
  assert.equal(patch.thumbnailImage, result.thumbnailImage);
  assert.equal(patch.ogImage, result.ogImage);
  assert.equal(patch.imageStatus, 'fallback');
  assert.equal(patch.generatedImageProvider, 'image2');
  assert.equal(patch.generatedImageModel, 'gpt-image-2');
});
