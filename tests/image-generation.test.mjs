import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';
import { buildArticleImagePrompt, articleImageAltText } from '../scripts/lib/article-image-prompt.mjs';
import { generateArticleImageSet, metadataPatchFromImageSet } from '../scripts/lib/image2-provider.mjs';
import { createImageProvider, describeImageProvider } from '../scripts/lib/image-providers/index.mjs';

const execFileAsync = promisify(execFile);
const imageGeneratorUrl = new URL('../scripts/lib/image-generator.mjs', import.meta.url).href;
const imageProvidersUrl = new URL('../scripts/lib/image-providers/index.mjs', import.meta.url).href;

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

test('Given no IMAGE_PROVIDER override When the provider registry loads Then image2 is the active default', async () => {
  const script = `
    const { describeImageProvider } = await import(${JSON.stringify(imageProvidersUrl)});
    console.log(JSON.stringify(describeImageProvider()));
  `;
  const { stdout } = await execFileAsync(process.execPath, ['--input-type=module', '-e', script], {
    env: { ...process.env, IMAGE_PROVIDER: '' },
  });

  assert.deepEqual(JSON.parse(stdout), {
    requested: 'image2',
    active: 'image2',
    configured: true,
  });
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
  assert.match(result.heroImage, /^\/generated\/articles\/image2-fixture-001-utility-queue-forces-new-ai-campus-timing\/hero\.webp$/);
  assert.match(result.thumbnailImage, /\/thumbnail\.webp$/);
  assert.match(result.ogImage, /\/og\.webp$/);
  assert.match(result.legacyImage, /^\/generated\/image2-fixture-001\.webp$/);

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

test('Given image2 without an API key When generation runs online Then it writes deterministic local fallback variants', async () => {
  const publicDir = fs.mkdtempSync(path.join(os.tmpdir(), 'compute-current-image2-missing-key-'));

  try {
    const result = await generateArticleImageSet(fixtureArticle(), {
      apiKey: '',
      offline: false,
      publicDir,
      now: () => new Date('2026-08-11T00:00:00.000Z'),
    });

    assert.equal(result.provider, 'image2');
    assert.equal(result.status, 'fallback');
    assert.match(result.error, /OPENAI_API_KEY missing/i);
    for (const imagePath of [result.heroImage, result.thumbnailImage, result.ogImage, result.legacyImage]) {
      assert.equal(fs.existsSync(path.join(publicDir, imagePath.replace(/^\//, ''))), true, `${imagePath} should exist`);
    }
  } finally {
    fs.rmSync(publicDir, { recursive: true, force: true });
  }
});

test('local poster fallback refuses unapproved publisher image before network access', async () => {
  // Given: a reachable remote image with no source authorization record.
  let requests = 0;
  const server = http.createServer((_request, response) => {
    requests += 1;
    response.writeHead(200, { 'content-type': 'image/png' });
    response.end('publisher image bytes');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'compute-current-image-rights-'));
  const script = `
    const { ensureArticleImage } = await import(${JSON.stringify(imageGeneratorUrl)});
    const image = await ensureArticleImage({
      id: 'unapproved-local-poster-fixture',
      title: 'Unapproved source image must not be fetched',
      source: 'Unknown Publisher',
      sourceUrl: 'https://unknown.example/story',
      sourceImage: process.env.SOURCE_IMAGE_URL,
      category: 'Power & Grid',
    });
    console.log(JSON.stringify({ image }));
  `;

  try {
    // When: the real image generator reaches its local poster fallback.
    const { stdout, stderr } = await execFileAsync(process.execPath, ['--input-type=module', '-e', script], {
      cwd: root,
      env: {
        ...process.env,
        IMAGE_PROVIDER: 'local',
        PIPELINE_OFFLINE: '0',
        CODEX_SANDBOX_NETWORK_DISABLED: '0',
        SOURCE_IMAGE_URL: `http://127.0.0.1:${port}/publisher.png`,
      },
    });
    const result = JSON.parse(stdout.trim());

    // Then: denial is observable, no request occurs, and safe local art is returned.
    assert.equal(requests, 0);
    assert.match(stderr, /image_reuse_not_authorized/);
    assert.match(result.image, /^\/generated\/articles\/unapproved-local-poster-fixture-/);
    assert.equal(fs.existsSync(path.join(root, 'public', result.image.replace(/^\//, ''))), true);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(root, { recursive: true, force: true });
  }
});
