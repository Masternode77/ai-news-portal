import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import sharp from 'sharp';
import {
  ensureCanonicalArticleImageSet,
  refreshCollection,
} from '../scripts/prepare-static-images.mjs';

const execFileAsync = promisify(execFile);
const repoRoot = path.dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const prepareStaticImagesUrl = pathToFileURL(path.join(repoRoot, 'scripts/prepare-static-images.mjs')).href;

async function makeTempProject() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'compute-current-origin-'));
  const publicDir = path.join(root, 'public');
  await fs.mkdir(publicDir, { recursive: true });
  return { root, publicDir };
}

async function withCwd(cwd, fn) {
  const previousCwd = process.cwd();
  process.chdir(cwd);
  try {
    return await fn();
  } finally {
    process.chdir(previousCwd);
  }
}

async function createFixturePng(filePath) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await sharp({
    create: {
      width: 64,
      height: 36,
      channels: 4,
      background: { r: 24, g: 86, b: 180, alpha: 1 },
    },
  })
    .png()
    .toFile(filePath);
}

async function fixturePngBuffer() {
  return sharp({
    create: {
      width: 64,
      height: 36,
      channels: 4,
      background: { r: 14, g: 114, b: 96, alpha: 1 },
    },
  }).png().toBuffer();
}

function injectedPublicImageFetch(bytes, onRequest = () => {}) {
  return {
    resolveHost: async () => [{ address: '93.184.216.34', family: 4 }],
    request: async ({ target, address }) => {
      onRequest({ target, address });
      return {
        status: 200,
        headers: {
          'content-type': 'image/png',
          'content-length': String(bytes.length),
        },
        body: (async function* body() { yield bytes; }()),
      };
    },
  };
}

async function imageHashes(publicDir, article) {
  const entries = await Promise.all([
    article.heroImage,
    article.thumbnailImage,
    article.ogImage,
    article.legacyImage,
  ].map(async (publicPath) => {
    const bytes = await fs.readFile(path.join(publicDir, publicPath.replace(/^\//, '')));
    return [publicPath, createHash('sha256').update(bytes).digest('hex')];
  }));
  return Object.fromEntries(entries);
}

async function createRemotePngServer() {
  const fixture = await fixturePngBuffer();

  let requests = 0;
  const server = http.createServer((req, res) => {
    requests += 1;
    if (req.url === '/source.png') {
      res.writeHead(200, {
        'content-type': 'image/png',
        'content-length': fixture.length,
      });
      res.end(fixture);
      return;
    }

    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('not found');
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();

  return {
    server,
    url: `http://127.0.0.1:${port}/source.png`,
    requests: () => requests,
    close: () => new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    }),
  };
}

test('article origin canonicalization', async (t) => {
  await t.test('local generated image backfills canonical webp variants', async () => {
    const { root, publicDir } = await makeTempProject();
    const article = {
      id: 'origin-local-fixture',
      title: 'Local origin artwork becomes canonical output',
      generatedImage: '/generated/origin-local-fixture/source.png',
    };
    const sourceFile = path.join(publicDir, article.generatedImage.replace(/^\//, ''));

    try {
      await withCwd(root, async () => {
        await createFixturePng(sourceFile);

        const result = await ensureCanonicalArticleImageSet(article, { publicDir });
        const expectedPaths = [
          result.paths.heroImage,
          result.paths.thumbnailImage,
          result.paths.ogImage,
          result.paths.legacyImage,
        ];

        assert.equal(result.changed, 4);
        assert.equal(result.skipped, false);
        assert.equal(result.authorizedSource, false);
        assert.ok(result.paths.heroImage.endsWith('/hero.webp'));
        assert.ok(result.paths.thumbnailImage.endsWith('/thumbnail.webp'));
        assert.ok(result.paths.ogImage.endsWith('/og.webp'));
        assert.ok(result.paths.legacyImage.endsWith('/origin-local-fixture.webp'));
        for (const publicPath of expectedPaths) {
          await fs.access(path.join(publicDir, publicPath.replace(/^\//, '')));
        }
      });
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  await t.test('unapproved local source-canonical image is refused', async () => {
    // Given: a local file explicitly identified as publisher-derived without authorization.
    const { root, publicDir } = await makeTempProject();
    const article = {
      id: 'origin-local-source-fixture',
      title: 'Local publisher artwork must remain quarantined',
      source: 'Unapproved Fixture',
      sourceUrl: 'https://unapproved.example/story',
      generatedImage: '/generated/origin-local-source-fixture/source.png',
      generatedImageProvider: 'source-image',
      imageStatus: 'source-canonical',
    };
    const sourceFile = path.join(publicDir, article.generatedImage.replace(/^\//, ''));

    try {
      await withCwd(root, async () => {
        await createFixturePng(sourceFile);

        // When: canonical variants are requested without a registry approval.
        const result = await ensureCanonicalArticleImageSet(article, {
          publicDir,
          sources: [],
          now: new Date('2026-08-09T00:00:00Z'),
        });

        // Then: canonicalization fails closed before creating derived files.
        assert.equal(result.changed, 0);
        assert.equal(result.skipped, true);
        assert.equal(result.reason, 'image_reuse_not_authorized');
        assert.equal(result.authorizationDetail, 'source_not_registered');
      });
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  await t.test('existing canonical targets do not bypass source authorization', async () => {
    // Given: canonical files whose record is later tagged as unapproved publisher artwork.
    const { root, publicDir } = await makeTempProject();
    const article = {
      id: 'origin-existing-source-fixture',
      title: 'Existing targets are not provenance evidence',
      source: 'Unapproved Fixture',
      sourceUrl: 'https://unapproved.example/story',
      generatedImage: '/generated/origin-existing-source-fixture/source.png',
    };
    const sourceFile = path.join(publicDir, article.generatedImage.replace(/^\//, ''));

    try {
      await withCwd(root, async () => {
        await createFixturePng(sourceFile);
        const initial = await ensureCanonicalArticleImageSet(article, { publicDir });
        assert.equal(initial.changed, 4);

        // When: the same existing targets are requested with source-derived metadata but no rights.
        const result = await ensureCanonicalArticleImageSet({
          ...article,
          generatedImage: initial.paths.heroImage,
          generatedImageProvider: 'source-image',
          generatedImageModel: 'origin-canonical',
          imageStatus: 'source-canonical',
        }, {
          publicDir,
          sources: [],
          now: new Date('2026-08-09T00:00:00Z'),
        });

        // Then: authorization fails closed even though every target already exists.
        assert.equal(result.changed, 0);
        assert.equal(result.skipped, true);
        assert.equal(result.authorizedSource, false);
        assert.equal(result.reason, 'image_reuse_not_authorized');
        assert.equal(result.authorizationDetail, 'source_not_registered');
      });
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  await t.test('repeated refresh preserves local-generated provenance when canonical assets already exist', async () => {
    // Given: an unapproved publisher image and a local placeholder that requires safe generation.
    const { root, publicDir } = await makeTempProject();
    const remote = await createRemotePngServer();
    const collectionPath = path.join(root, 'repeated-images.json');
    const article = {
      id: 'origin-repeated-local-fixture',
      title: 'Repeated builds preserve deterministic editorial artwork',
      source: 'Unapproved Fixture',
      sourceUrl: 'https://unapproved.example/story',
      sourceImage: remote.url,
      generatedImage: '/generated/fallbacks/ai-infrastructure.svg',
      generatedImageProvider: 'local-placeholder',
      generatedImageModel: 'local-svg',
      imageStatus: 'fallback',
      primary_category: 'Data Centers',
    };

    try {
      await fs.writeFile(collectionPath, `${JSON.stringify([article], null, 2)}\n`, 'utf8');
      await withCwd(root, async () => {
        const first = await refreshCollection('first', collectionPath);
        const firstArticle = first.items[0];
        const firstHashes = await imageHashes(publicDir, firstArticle);

        // When: static image preparation refreshes the persisted record a second time.
        const second = await refreshCollection('second', collectionPath);
        const secondArticle = second.items[0];
        const secondHashes = await imageHashes(publicDir, secondArticle);

        // Then: metadata and all four assets are idempotent without publisher-image access.
        assert.equal(firstArticle.generatedImageProvider, 'local-generated');
        assert.equal(second.changed, 0);
        assert.deepEqual(secondArticle, firstArticle);
        assert.deepEqual(secondHashes, firstHashes);
        assert.equal(remote.requests(), 0);
      });
    } finally {
      await remote.close();
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  await t.test('remote source image canonicalizes only with current explicit authorization', async () => {
    const { root, publicDir } = await makeTempProject();
    const bytes = await fixturePngBuffer();
    const requests = [];
    const article = {
      id: 'origin-remote-fixture',
      title: 'Remote origin artwork should be canonicalized locally',
      source: 'Authorized Fixture',
      sourceUrl: 'https://authorized.example/story',
      sourceImage: 'https://cdn.authorized.example/source.png',
    };
    const sources = [{
      id: 'authorized-fixture',
      name: 'Authorized Fixture',
      domain: 'authorized.example',
      image_hosts: 'cdn.authorized.example',
      text_use_basis: 'licensed',
      image_use_basis: 'licensed',
      terms_url: 'https://authorized.example/terms',
      reviewed_at: '2026-08-01',
      allow_text_use: true,
      allow_image_reuse: true,
    }];

    try {
      await withCwd(root, async () => {
        const result = await ensureCanonicalArticleImageSet(article, {
          publicDir,
          sources,
          now: new Date('2026-08-09T00:00:00Z'),
          sourceImageFetchOptions: injectedPublicImageFetch(bytes, (request) => requests.push(request)),
        });

        assert.equal(result.changed, 4);
        assert.equal(result.skipped, false);
        assert.equal(result.authorizedSource, true);
        assert.deepEqual(requests, [{
          target: new URL('https://cdn.authorized.example/source.png'),
          address: '93.184.216.34',
        }]);
        for (const publicPath of [
          result.paths.heroImage,
          result.paths.thumbnailImage,
          result.paths.ogImage,
          result.paths.legacyImage,
        ]) {
          await fs.access(path.join(publicDir, publicPath.replace(/^\//, '')));
        }
      });
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  await t.test('existing targets are not provenance evidence even when source reuse is authorized', async () => {
    // Given: publisher artwork previously canonicalized under current image-reuse rights.
    const { root, publicDir } = await makeTempProject();
    const bytes = await fixturePngBuffer();
    let requests = 0;
    const article = {
      id: 'origin-authorized-reuse-fixture',
      title: 'Authorized source targets may be reused',
      source: 'Authorized Fixture',
      sourceUrl: 'https://authorized.example/story',
      sourceImage: 'https://cdn.authorized.example/source.png',
    };
    const sources = [{
      id: 'authorized-fixture',
      name: 'Authorized Fixture',
      domain: 'authorized.example',
      image_hosts: 'cdn.authorized.example',
      text_use_basis: 'licensed',
      image_use_basis: 'licensed',
      terms_url: 'https://authorized.example/terms',
      reviewed_at: '2026-08-01',
      allow_text_use: true,
      allow_image_reuse: true,
    }];

    try {
      await withCwd(root, async () => {
        const initial = await ensureCanonicalArticleImageSet(article, {
          publicDir,
          sources,
          now: new Date('2026-08-09T00:00:00Z'),
          sourceImageFetchOptions: injectedPublicImageFetch(bytes, () => { requests += 1; }),
        });

        // When: the explicitly source-derived record is checked against those existing targets.
        const reused = await ensureCanonicalArticleImageSet({
          ...article,
          generatedImage: initial.paths.heroImage,
          generatedImageProvider: 'source-image',
          generatedImageModel: 'origin-canonical',
          imageStatus: 'source-canonical',
        }, {
          publicDir,
          sources,
          now: new Date('2026-08-09T00:00:00Z'),
        });

        // Then: rights remain fail-closed from proving the provenance of pre-existing bytes.
        assert.equal(reused.changed, 0);
        assert.equal(reused.skipped, false);
        assert.equal(reused.authorizedSource, false);
        assert.equal(requests, 1);
      });
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  await t.test('unapproved remote source image is refused before network access', async () => {
    // Given: a reachable publisher image without a registry authorization.
    const { root, publicDir } = await makeTempProject();
    const remote = await createRemotePngServer();
    const article = {
      id: 'origin-unapproved-fixture',
      title: 'Unapproved publisher artwork must not be fetched',
      source: 'Unapproved Fixture',
      sourceUrl: 'https://unapproved.example/story',
      sourceImage: remote.url,
    };

    try {
      await withCwd(root, async () => {
        // When: canonicalization is attempted with no authorization record.
        const result = await ensureCanonicalArticleImageSet(article, {
          publicDir,
          sources: [],
          now: new Date('2026-08-09T00:00:00Z'),
        });

        // Then: the refusal is observable and the server receives no request.
        assert.equal(result.changed, 0);
        assert.equal(result.skipped, true);
        assert.equal(result.reason, 'image_reuse_not_authorized');
        assert.equal(result.authorizationDetail, 'source_not_registered');
        assert.equal(remote.requests(), 0);
      });
    } finally {
      await remote.close();
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  await t.test('malformed source image skips cleanly with a specific reason', async () => {
    const { root, publicDir } = await makeTempProject();
    const article = {
      id: 'origin-malformed-fixture',
      title: 'Malformed source image should not crash canonicalization',
      sourceImage: 'not-a-url',
    };

    try {
      await withCwd(root, async () => {
        const result = await ensureCanonicalArticleImageSet(article, { publicDir });

        assert.equal(result.changed, 0);
        assert.equal(result.skipped, true);
        assert.equal(result.reason, 'invalid_source_image_url');
      });
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  await t.test('offline mode does not fetch remote source images', async () => {
    const { root, publicDir } = await makeTempProject();
    const remote = await createRemotePngServer();
    const script = `
      const { ensureCanonicalArticleImageSet } = await import(${JSON.stringify(prepareStaticImagesUrl)});
      const result = await ensureCanonicalArticleImageSet({
        id: 'origin-offline-fixture',
        title: 'Offline mode should skip source fetches',
        sourceImage: process.env.SOURCE_IMAGE_URL,
      }, { publicDir: process.env.PUBLIC_DIR });
      console.log(JSON.stringify(result));
    `;

    try {
      const { stdout } = await execFileAsync(process.execPath, ['--input-type=module', '-e', script], {
        cwd: root,
        env: {
          ...process.env,
          PIPELINE_OFFLINE: '1',
          PUBLIC_DIR: publicDir,
          SOURCE_IMAGE_URL: remote.url,
        },
      });
      const result = JSON.parse(stdout.trim());

      assert.equal(result.changed, 0);
      assert.equal(result.skipped, true);
      assert.equal(result.reason, 'pipeline_offline');
    } finally {
      await remote.close();
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  await t.test('forced image generation keeps image2 ahead of source canonicalization', async () => {
    const { root, publicDir } = await makeTempProject();
    const remote = await createRemotePngServer();
    const collectionPath = path.join(root, 'forced-images.json');
    const article = {
      id: 'force-image2-fixture',
      title: 'Forced image2 output should win over source artwork',
      source: 'Compute Current Test',
      primary_category: 'Power & Grid',
      sourceImage: remote.url,
      forceAiImage: true,
    };
    const script = `
      const { refreshCollection } = await import(${JSON.stringify(prepareStaticImagesUrl)});
      const result = await refreshCollection('forced', process.env.COLLECTION_PATH);
      console.log(JSON.stringify(result));
    `;

    try {
      await fs.writeFile(collectionPath, JSON.stringify([article], null, 2), 'utf8');
      await execFileAsync(process.execPath, ['--input-type=module', '-e', script], {
        cwd: root,
        env: {
          ...process.env,
          PIPELINE_OFFLINE: '1',
          COLLECTION_PATH: collectionPath,
        },
      });
      const [updated] = JSON.parse(await fs.readFile(collectionPath, 'utf8'));

      assert.equal(updated.generatedImageProvider, 'image2');
      assert.equal(updated.generatedImageModel, 'gpt-image-2');
      assert.equal(updated.imageStatus, 'fallback');
      assert.match(updated.heroImage, /\/generated\/articles\/force-image2-fixture-forced-image2-output-should-win-over-source-artwork\/hero\.webp$/);
      assert.match(updated.thumbnailImage, /\/thumbnail\.webp$/);
      assert.match(updated.ogImage, /\/og\.webp$/);
      assert.match(updated.legacyImage, /\/generated\/force-image2-fixture\.webp$/);
      assert.equal(updated.generatedImage, updated.heroImage);
      for (const publicPath of [
        updated.heroImage,
        updated.thumbnailImage,
        updated.ogImage,
        updated.legacyImage,
      ]) {
        await fs.access(path.join(publicDir, publicPath.replace(/^\//, '')));
      }
    } finally {
      await remote.close();
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
