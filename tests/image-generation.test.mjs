import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { buildArticleImagePrompt, articleImageAltText } from '../scripts/lib/article-image-prompt.mjs';
import {
  createImage2Provider,
  generateArticleImageSet,
  metadataPatchFromImageSet,
} from '../scripts/lib/image2-provider.mjs';
import { createChatGptOauthRuntimeProvider } from '../scripts/lib/image-providers/chatgpt-oauth-runtime.mjs';
import { createGeminiImageProvider } from '../scripts/lib/image-providers/gemini.mjs';
import { createOpenAiImageApiProvider } from '../scripts/lib/image-providers/openai-image-api.mjs';
import { ARTICLE_IMAGE_VARIANTS } from '../scripts/lib/image-store.mjs';
import {
  ensureArticleImage,
  ensureArticleImageResult,
  imageGenerationStages,
  writeSourcePosterImageSet,
} from '../scripts/lib/image-generator.mjs';
import { backfillLocalImages } from '../scripts/lib/production-content-phases.mjs';
import { generateCandidate } from '../scripts/lib/production-content-phases.mjs';
import { articleImageProvenance } from '../scripts/lib/article-image-surface.mjs';
import { generateReplacement } from '../scripts/regenerate-stock-card-images.mjs';

const packageJson = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const updateNewsWorkflow = fs.readFileSync(new URL('../.github/workflows/update-news.yml', import.meta.url), 'utf8');
const readme = fs.readFileSync(new URL('../README.md', import.meta.url), 'utf8');
const chatGptRuntimeProvider = fs.readFileSync(
  new URL('../scripts/lib/image-providers/chatgpt-oauth-runtime.mjs', import.meta.url),
  'utf8',
);
const stockRegenerationScript = fs.readFileSync(
  new URL('../scripts/regenerate-stock-card-images.mjs', import.meta.url),
  'utf8',
);

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

test('image provider directory contains no duplicate snapshot modules', () => {
  const providerDirectory = new URL('../scripts/lib/image-providers/', import.meta.url);
  const duplicateSnapshots = fs
    .readdirSync(providerDirectory)
    .filter((entry) => /\s+\d+\.mjs$/i.test(entry))
    .sort();

  assert.deepEqual(duplicateSnapshots, []);
  assert.match(packageJson.scripts['content:gate'], /tests\/image-generation\.test\.mjs/);
});

test('image2 is the canonical default provider in runtime and scheduled refreshes', () => {
  const registryUrl = pathToFileURL(path.join(process.cwd(), 'scripts/lib/image-providers/index.mjs')).href;
  const probe = `
    import { describeImageProvider } from ${JSON.stringify(registryUrl)};
    process.stdout.write(JSON.stringify(describeImageProvider()));
  `;
  const {
    IMAGE_PROVIDER: _imageProvider,
    OPENAI_API_KEY: _openAiApiKey,
    PIPELINE_OFFLINE: _pipelineOffline,
    CODEX_SANDBOX_NETWORK_DISABLED: _networkDisabled,
    ...cleanEnv
  } = process.env;
  const unconfigured = spawnSync(process.execPath, ['--input-type=module', '--eval', probe], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: cleanEnv,
  });
  const configured = spawnSync(process.execPath, ['--input-type=module', '--eval', probe], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: { ...cleanEnv, OPENAI_API_KEY: 'test-only-image-key' },
  });

  assert.equal(unconfigured.status, 0, unconfigured.stderr);
  assert.deepEqual(JSON.parse(unconfigured.stdout), {
    requested: 'image2',
    active: 'local',
    configured: false,
  });
  assert.equal(configured.status, 0, configured.stderr);
  assert.deepEqual(JSON.parse(configured.stdout), {
    requested: 'image2',
    active: 'image2',
    configured: true,
  });
  assert.match(updateNewsWorkflow, /IMAGE_PROVIDER:\s*image2/);
  assert.match(updateNewsWorkflow, /OPENAI_API_KEY:\s*\$\{\{\s*secrets\.OPENAI_API_KEY\s*\}\}/);
  assert.doesNotMatch(updateNewsWorkflow, /GEMINI_(?:API_KEY|IMAGE_MODEL)/);
  assert.match(readme, /IMAGE_PROVIDER` \*\(optional\)\*: defaults to `image2`/);
  assert.match(readme, /IMAGE2_HERO_SIZE/);
  assert.match(readme, /IMAGE2_OUTPUT_FORMAT/);
  assert.match(readme, /production editorial candidates explicitly set `forceAiImage`/i);
  assert.doesNotMatch(readme, /Default provider is `IMAGE_PROVIDER=chatgpt`/);
});

test('source artwork precedes image2 unless AI generation is explicitly forced', () => {
  assert.deepEqual(imageGenerationStages({ sourceImage: 'https://example.com/source.jpg' }), [
    'source',
    'provider',
    'local',
  ]);
  assert.deepEqual(imageGenerationStages({
    sourceImage: 'https://example.com/source.jpg',
    forceAiImage: true,
  }), [
    'provider',
    'source',
    'local',
  ]);
  assert.deepEqual(imageGenerationStages({}), ['provider', 'local']);
  assert.deepEqual(imageGenerationStages({
    sourceImage: 'https://example.com/source.jpg',
    requireProviderImage: true,
  }), ['provider']);
});

test('source poster generation writes every canonical public variant', async () => {
  const publicDir = fs.mkdtempSync(path.join(os.tmpdir(), 'compute-current-source-image-'));
  const sourceBytes = await sharp({
    create: {
      width: 1600,
      height: 900,
      channels: 3,
      background: { r: 35, g: 80, b: 110 },
    },
  }).png().toBuffer();
  const result = await writeSourcePosterImageSet(
    fixtureArticle(),
    sourceBytes,
    'image/png',
    { publicDir },
  );

  assert.equal(result.provider, 'source');
  assert.equal(result.model, 'publisher-artwork');
  assert.equal(result.status, 'source');
  for (const imagePath of [result.heroImage, result.thumbnailImage, result.ogImage, result.legacyImage]) {
    const outputPath = path.join(publicDir, imagePath.replace(/^\//, ''));
    assert.equal(fs.existsSync(outputPath), true, `${imagePath} should exist`);
    assert.equal((await sharp(outputPath).metadata()).format, 'webp');
  }
});

test('provider failure advances to source unless provider-only regeneration is required', async () => {
  const calls = [];
  const provider = {
    name: 'image2',
    async generate() {
      calls.push('provider');
      throw new Error('provider unavailable');
    },
  };
  const item = fixtureArticle({
    sourceImage: 'https://example.com/source.jpg',
    forceAiImage: true,
    forceImageRefresh: true,
  });
  const generatedImage = await ensureArticleImage(item, {
    offline: false,
    provider,
    generateSource: async () => {
      calls.push('source');
      return '/generated/source.webp';
    },
    generateLocal: async () => {
      calls.push('local');
      return '/generated/local.webp';
    },
  });

  assert.equal(generatedImage, '/generated/source.webp');
  assert.deepEqual(calls, ['provider', 'source']);

  await assert.rejects(
    () => ensureArticleImage({ ...item, requireProviderImage: true }, {
      offline: false,
      provider,
      generateSource: async () => '/generated/source.webp',
      generateLocal: async () => '/generated/local.webp',
    }),
    /provider unavailable/,
  );
});

test('production image backfill preserves source and fallback provenance metadata', async () => {
  const sourceResult = {
    heroImage: '/generated/fallbacks/power-grid.svg',
    thumbnailImage: '/generated/fallbacks/data-centers.svg',
    ogImage: '/generated/fallbacks/cloud-capacity.svg',
    legacyImage: '/generated/fallbacks/ai-infrastructure.svg',
    provider: 'source',
    model: 'publisher-artwork',
    status: 'source',
    error: '',
  };
  const fallbackResult = {
    heroImage: '/generated/fallbacks/semiconductors.svg',
    thumbnailImage: '/generated/fallbacks/cooling.svg',
    ogImage: '/generated/fallbacks/capital-markets.svg',
    legacyImage: '/generated/fallbacks/regulation.svg',
    provider: 'local-placeholder',
    model: 'local-raster',
    status: 'fallback',
    error: 'provider unavailable',
  };
  const articles = [
    fixtureArticle({
      id: 'source',
      generatedImage: '',
      generatedImageProvider: 'image2',
      generatedImageModel: 'stale-model',
      imageStatus: 'failed',
      imageError: 'stale provider failure',
    }),
    fixtureArticle({
      id: 'fallback',
      generatedImage: '',
      generatedImageProvider: 'image2',
      generatedImageModel: 'stale-model',
      imageStatus: 'failed',
      imageError: 'stale provider failure',
    }),
  ];
  const backfilled = await backfillLocalImages(articles, {
    collectOutputs: true,
    ensureImage: async (article) => article.id === 'source' ? sourceResult : fallbackResult,
  });

  assert.equal(backfilled.articles[0].generatedImageProvider, 'source');
  assert.equal(backfilled.articles[0].generatedImageModel, 'publisher-artwork');
  assert.equal(backfilled.articles[0].imageStatus, 'source');
  assert.equal(backfilled.articles[0].imageError, '');
  assert.equal(backfilled.articles[0].thumbnailImage, sourceResult.thumbnailImage);
  assert.equal(articleImageProvenance(backfilled.articles[0]).kind, 'source');
  assert.equal(backfilled.articles[1].generatedImageProvider, 'local-placeholder');
  assert.equal(backfilled.articles[1].generatedImageModel, 'local-raster');
  assert.equal(backfilled.articles[1].imageStatus, 'fallback');
  assert.equal(backfilled.articles[1].imageError, 'provider unavailable');
  assert.equal(backfilled.articles[1].thumbnailImage, fallbackResult.thumbnailImage);
  assert.equal(articleImageProvenance(backfilled.articles[1]).kind, 'fallback');
  assert.deepEqual(new Set(backfilled.outputPaths), new Set([
    ...Object.values(sourceResult).filter((value) => typeof value === 'string' && value.startsWith('/generated/')),
    ...Object.values(fallbackResult).filter((value) => typeof value === 'string' && value.startsWith('/generated/')),
  ]));
});

test('fresh provider results replace stale variants and clear stale errors', async () => {
  const item = fixtureArticle({
    forceImageRefresh: true,
    generatedImage: '/generated/old.webp',
    thumbnailImage: '/generated/old-thumbnail.webp',
    ogImage: '/generated/old-og.webp',
    legacyImage: '/generated/old-legacy.webp',
    generatedImageModel: 'old-model',
    imageError: 'old provider failed',
  });
  const result = await ensureArticleImageResult(item, {
    offline: false,
    provider: {
      name: 'legacy-test',
      model: 'legacy-test-model',
      generate: async () => '/generated/fresh.webp',
    },
  });

  assert.equal(result.heroImage, '/generated/fresh.webp');
  assert.equal(result.thumbnailImage, '/generated/fresh.webp');
  assert.equal(result.ogImage, '/generated/fresh.webp');
  assert.equal(result.legacyImage, '/generated/fresh.webp');
  assert.equal(result.model, 'legacy-test-model');
  assert.equal(result.status, 'generated');
  assert.equal(result.error, '');
});

test('empty provider results never masquerade a stale image as freshly generated', async () => {
  for (const generated of ['', { heroImage: '' }]) {
    const result = await ensureArticleImageResult(fixtureArticle({
      forceImageRefresh: true,
      generatedImage: '/generated/stale.webp',
      generatedImageProvider: 'stale-provider',
    }), {
      offline: false,
      provider: {
        name: 'image2',
        model: 'gpt-image-2',
        generateWithMetadata: async () => generated,
      },
      generateLocal: async () => ({
        heroImage: '/generated/local.webp',
        provider: 'local-placeholder',
        model: 'local-raster',
        status: 'fallback',
      }),
    });

    assert.equal(result.heroImage, '/generated/local.webp');
    assert.equal(result.provider, 'local-placeholder');
    assert.equal(result.status, 'fallback');
    assert.match(result.error, /provider: image2 returned no image path/);
  }
});

test('provider-only generation rejects an empty provider result', async () => {
  await assert.rejects(
    ensureArticleImageResult(fixtureArticle({
      forceImageRefresh: true,
      requireProviderImage: true,
      generatedImage: '/generated/stale.webp',
    }), {
      offline: false,
      provider: {
        name: 'image2',
        model: 'gpt-image-2',
        generate: async () => '',
      },
    }),
    /image2 returned no image path/,
  );
});

test('fallback result records bounded provider and source failure reasons', async () => {
  const result = await ensureArticleImageResult(fixtureArticle({
    sourceImage: 'https://example.com/source.jpg',
    forceAiImage: true,
    forceImageRefresh: true,
  }), {
    offline: false,
    provider: {
      name: 'image2',
      model: 'gpt-image-2',
      generate: async () => { throw new Error('quota unavailable'); },
    },
    generateSource: async () => { throw new Error('source decode failed'); },
    generateLocal: async () => ({
      heroImage: '/generated/local.webp',
      provider: 'local-placeholder',
      model: 'local-raster',
      status: 'fallback',
      error: '',
    }),
  });

  assert.equal(result.provider, 'local-placeholder');
  assert.equal(result.status, 'fallback');
  assert.match(result.error, /provider: quota unavailable/);
  assert.match(result.error, /source: source decode failed/);
  assert.ok(result.error.length <= 500);
});

test('source failure remains visible when provider generation succeeds', async () => {
  const result = await ensureArticleImageResult(fixtureArticle({
    sourceImage: 'https://example.com/source.jpg',
    forceImageRefresh: true,
  }), {
    offline: false,
    generateSource: async () => { throw new Error('source decode failed'); },
    provider: {
      name: 'image2',
      model: 'gpt-image-2',
      generateWithMetadata: async () => ({
        heroImage: '/generated/articles/provider/hero.webp',
        thumbnailImage: '/generated/articles/provider/thumbnail.webp',
        ogImage: '/generated/articles/provider/og.webp',
        legacyImage: '/generated/provider.webp',
        provider: 'image2',
        model: 'gpt-image-2',
        status: 'generated',
        error: '',
      }),
    },
  });

  assert.equal(result.provider, 'image2');
  assert.match(result.error, /source: source decode failed/);
});

test('production candidate generation retains the complete fresh image patch', async () => {
  const article = fixtureArticle({
    evidence_pack: { ok: true, origin: 'extraction_only' },
  });
  const imageResult = {
    heroImage: '/generated/articles/candidate/hero.webp',
    thumbnailImage: '/generated/articles/candidate/thumbnail.webp',
    ogImage: '/generated/articles/candidate/og.webp',
    legacyImage: '/generated/candidate.webp',
    provider: 'source',
    model: 'publisher-artwork',
    status: 'source',
    error: '',
  };
  const generated = await generateCandidate(article, [], {
    generateMetadata: async () => ({ ok: true, article }),
    ensureImage: async () => imageResult,
    attachLens: async ([input]) => [{ ...input, article_blueprint: 'fixture-blueprint' }],
  });

  assert.equal(generated.generatedImage, imageResult.heroImage);
  assert.equal(generated.thumbnailImage, imageResult.thumbnailImage);
  assert.equal(generated.ogImage, imageResult.ogImage);
  assert.equal(generated.generatedImageProvider, 'source');
  assert.equal(generated.generatedImageModel, 'publisher-artwork');
  assert.equal(generated.imageStatus, 'source');
  assert.equal(generated.imageError, '');
});

test('explicit offline override keeps injected provider orchestration hermetic', async () => {
  const result = await ensureArticleImageResult(fixtureArticle({
    forceImageRefresh: true,
  }), {
    offline: false,
    provider: {
      name: 'image2',
      generateWithMetadata: async () => ({
        heroImage: '/generated/articles/provider/hero.webp',
        thumbnailImage: '/generated/articles/provider/thumbnail.webp',
        ogImage: '/generated/articles/provider/og.webp',
        legacyImage: '/generated/provider.webp',
        provider: 'image2',
        model: 'gpt-image-2',
        status: 'generated',
      }),
    },
  });

  assert.equal(result.provider, 'image2');
  assert.equal(result.status, 'generated');
  assert.equal(result.heroImage, '/generated/articles/provider/hero.webp');
});

test('stock regeneration rejects a missing Image2 credential without local opt-in', () => {
  const {
    OPENAI_API_KEY: _openAiApiKey,
    ...cleanEnv
  } = process.env;
  const result = spawnSync(process.execPath, ['scripts/regenerate-stock-card-images.mjs', '--homepage-only'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: { ...cleanEnv, IMAGE_PROVIDER: 'image2' },
  });

  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /No image provider is configured/);
});

test('legacy image paths retain honest structured provider provenance', () => {
  assert.match(chatGptRuntimeProvider, /const model = 'chatgpt-runtime'/);
  assert.doesNotMatch(chatGptRuntimeProvider, /model:\s*OPENAI_IMAGE_MODEL/);
  assert.match(stockRegenerationScript, /ensureArticleImageResult/);
  assert.match(stockRegenerationScript, /imageMetadataPatch/);
  assert.doesNotMatch(stockRegenerationScript, /local-svg/);
  assert.doesNotMatch(stockRegenerationScript, /generatedImageModel:\s*ALLOW_LOCAL_PLACEHOLDER/);
});

test('stock regeneration writes Image2 and legacy provider variants with honest metadata', async () => {
  const sourceBytes = await sharp({
    create: {
      width: 1600,
      height: 900,
      channels: 3,
      background: { r: 24, g: 88, b: 132 },
    },
  }).png().toBuffer();
  const encoded = sourceBytes.toString('base64');
  const cases = [
    {
      expectedProvider: 'image2',
      expectedModel: 'gpt-image-2',
      create: (publicDir) => createImage2Provider({
        apiKey: 'test-image2-key',
        offline: false,
        publicDir,
        requestImage: async () => ({ bytes: sourceBytes, mimeType: 'image/png' }),
      }),
    },
    {
      expectedProvider: 'chatgpt',
      expectedModel: 'chatgpt-runtime',
      create: (publicDir) => createChatGptOauthRuntimeProvider({
        endpoint: 'https://runtime.example.com/images',
        accessToken: 'test-runtime-token',
        publicDir,
        request: async () => ({
          ok: true,
          json: async () => ({ imageBase64: encoded, mimeType: 'image/png' }),
        }),
      }),
    },
    {
      expectedProvider: 'openai-api',
      expectedModel: 'gpt-image-2',
      create: (publicDir) => createOpenAiImageApiProvider({
        apiKey: 'test-openai-key',
        publicDir,
        requestImage: async () => ({ bytes: sourceBytes, mimeType: 'image/png' }),
      }),
    },
    {
      expectedProvider: 'legacy-gemini',
      create: (publicDir) => createGeminiImageProvider({
        apiKey: 'test-gemini-key',
        publicDir,
        request: async () => ({
          ok: true,
          json: async () => ({
            candidates: [{ content: { parts: [{ inlineData: { data: encoded, mimeType: 'image/png' } }] } }],
          }),
        }),
      }),
    },
  ];

  for (const [index, providerCase] of cases.entries()) {
    const publicDir = fs.mkdtempSync(path.join(os.tmpdir(), `compute-current-legacy-${index}-`));
    const provider = providerCase.create(publicDir);
    const result = await generateReplacement(
      fixtureArticle({ id: `legacy-provider-${index}` }),
      provider,
      {
        imageOptions: { offline: false },
        now: () => new Date('2026-06-01T00:00:00.000Z'),
      },
    );

    assert.equal(result.generatedImageProvider, providerCase.expectedProvider);
    assert.equal(result.generatedImageModel, providerCase.expectedModel || provider.model);
    assert.equal(result.imageStatus, 'generated');
    assert.equal(result.imageError, '');
    assert.equal(result.stockImageReplacedAt, '2026-06-01T00:00:00.000Z');
    assert.notEqual(result.heroImage, result.thumbnailImage);
    assert.notEqual(result.heroImage, result.ogImage);

    for (const [key, variant] of Object.entries(ARTICLE_IMAGE_VARIANTS)) {
      const imagePath = result[`${key}Image`];
      const outputPath = path.join(publicDir, imagePath.replace(/^\//, ''));
      const metadata = await sharp(outputPath).metadata();
      assert.equal(metadata.width, variant.width, `${providerCase.expectedProvider} ${key} width`);
      assert.equal(metadata.height, variant.height, `${providerCase.expectedProvider} ${key} height`);
    }
    assert.equal(fs.existsSync(path.join(publicDir, result.legacyImage.replace(/^\//, ''))), true);
  }
});

test('stock regeneration local opt-in writes canonical fallback variants', async () => {
  const publicDir = fs.mkdtempSync(path.join(os.tmpdir(), 'compute-current-stock-local-'));
  const result = await generateReplacement(fixtureArticle({ id: 'stock-local' }), null, {
    allowLocalPlaceholder: true,
    imageOptions: {
      offline: true,
      generateLocal: (article) => generateArticleImageSet(article, { offline: true, publicDir }),
    },
    now: () => new Date('2026-06-01T00:00:00.000Z'),
  });

  assert.equal(result.generatedImageProvider, 'local-placeholder');
  assert.equal(result.generatedImageModel, 'local-raster');
  assert.equal(result.imageStatus, 'fallback');
  for (const [key, variant] of Object.entries(ARTICLE_IMAGE_VARIANTS)) {
    const metadata = await sharp(path.join(publicDir, result[`${key}Image`].replace(/^\//, ''))).metadata();
    assert.equal(metadata.width, variant.width);
    assert.equal(metadata.height, variant.height);
  }
  assert.equal(fs.existsSync(path.join(publicDir, result.legacyImage.replace(/^\//, ''))), true);
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

test('offline image request writes honest local metadata and canonical fallback variants', async () => {
  const publicDir = fs.mkdtempSync(path.join(os.tmpdir(), 'compute-current-image2-'));
  const result = await generateArticleImageSet(fixtureArticle(), {
    offline: true,
    publicDir,
    now: () => new Date('2026-05-31T00:00:00.000Z'),
  });
  const patch = metadataPatchFromImageSet(result);

  assert.equal(result.provider, 'local-placeholder');
  assert.equal(result.model, 'local-raster');
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
    const outputPath = path.join(publicDir, imagePath.replace(/^\//, ''));
    assert.equal(fs.existsSync(outputPath), true, `${imagePath} should exist`);
    assert.equal((await sharp(outputPath).metadata()).format, 'webp');
  }

  assert.equal(patch.generatedImage, result.heroImage);
  assert.equal(patch.heroImage, result.heroImage);
  assert.equal(patch.thumbnailImage, result.thumbnailImage);
  assert.equal(patch.ogImage, result.ogImage);
  assert.equal(patch.imageStatus, 'fallback');
  assert.equal(patch.generatedImageProvider, 'local-placeholder');
  assert.equal(patch.generatedImageModel, 'local-raster');
});
