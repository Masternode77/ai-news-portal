import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import sharp from 'sharp';
import { ensureCanonicalArticleImageSet } from '../scripts/prepare-static-images.mjs';
import { writeSafePublicFile } from '../scripts/lib/safe-public-file.mjs';

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

async function createRemotePngServer() {
  const fixture = await sharp({
    create: {
      width: 64,
      height: 36,
      channels: 4,
      background: { r: 14, g: 114, b: 96, alpha: 1 },
    },
  })
    .png()
    .toBuffer();

  const server = http.createServer((req, res) => {
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

  await t.test('overwrite refreshes source-canonical output from the remote source instead of the stale hero', async () => {
    const { root, publicDir } = await makeTempProject();
    const article = {
      id: 'origin-overwrite-fixture',
      title: 'Remote source replaces a stale canonical hero',
      generatedImage: '/generated/origin-overwrite-fixture/stale.png',
    };
    const staleFile = path.join(publicDir, article.generatedImage.replace(/^\//, ''));

    try {
      await withCwd(root, async () => {
        await createFixturePng(staleFile);
        const initial = await ensureCanonicalArticleImageSet(article, { publicDir });
        const remoteBytes = await sharp({
          create: {
            width: 64,
            height: 36,
            channels: 4,
            background: { r: 12, g: 190, b: 44, alpha: 1 },
          },
        }).png().toBuffer();
        let remoteCalls = 0;

        const refreshed = await ensureCanonicalArticleImageSet({
          ...article,
          sourceImage: 'https://source.example/real.png',
          heroImage: initial.paths.heroImage,
          generatedImage: initial.paths.heroImage,
          generatedImageProvider: 'source-image',
          generatedImageModel: 'origin-canonical',
          imageStatus: 'source-canonical',
        }, {
          publicDir,
          overwrite: true,
          fetchRemoteSourceImage: async () => {
            remoteCalls += 1;
            return { bytes: remoteBytes };
          },
        });

        const pixel = await sharp(path.join(publicDir, refreshed.paths.heroImage.replace(/^\//, '')))
          .resize(1, 1)
          .removeAlpha()
          .raw()
          .toBuffer();
        assert.equal(refreshed.skipped, false);
        assert.equal(remoteCalls, 1);
        assert.ok(pixel[1] > pixel[2] * 2, `expected green remote source, received ${[...pixel]}`);
      });
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  await t.test('variant promotion rolls back earlier files when a later write fails', async () => {
    const { root, publicDir } = await makeTempProject();
    const article = {
      id: 'origin-rollback-fixture',
      title: 'Canonical variants remain consistent after a failed promotion',
      generatedImage: '/generated/origin-rollback-fixture/source.png',
    };
    const sourceFile = path.join(publicDir, article.generatedImage.replace(/^\//, ''));

    try {
      await withCwd(root, async () => {
        await createFixturePng(sourceFile);
        const initial = await ensureCanonicalArticleImageSet(article, { publicDir });
        const publicPaths = [
          initial.paths.heroImage,
          initial.paths.thumbnailImage,
          initial.paths.ogImage,
          initial.paths.legacyImage,
        ];
        const originals = await Promise.all(publicPaths.map((publicPath) => (
          fs.readFile(path.join(publicDir, publicPath.replace(/^\//, '')))
        )));
        const remoteBytes = await sharp({
          create: {
            width: 64,
            height: 36,
            channels: 4,
            background: { r: 12, g: 190, b: 44, alpha: 1 },
          },
        }).png().toBuffer();
        let writes = 0;

        await assert.rejects(
          ensureCanonicalArticleImageSet({
            ...article,
            ...initial.paths,
            sourceImage: 'https://source.example/real.png',
          }, {
            publicDir,
            overwrite: true,
            fetchRemoteSourceImage: async () => ({ bytes: remoteBytes }),
            writePublicFile: async (...args) => {
              writes += 1;
              if (writes === 2) throw new Error('simulated canonical promotion failure');
              return writeSafePublicFile(...args);
            },
          }),
          /simulated canonical promotion failure/,
        );
        for (let index = 0; index < publicPaths.length; index += 1) {
          assert.deepEqual(
            await fs.readFile(path.join(publicDir, publicPaths[index].replace(/^\//, ''))),
            originals[index],
          );
        }
      });
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  await t.test('remote source image on a loopback destination is rejected', async () => {
    const { root, publicDir } = await makeTempProject();
    const remote = await createRemotePngServer();
    const article = {
      id: 'origin-remote-fixture',
      title: 'Remote origin artwork should be canonicalized locally',
      sourceImage: remote.url,
    };

    try {
      await withCwd(root, async () => {
        const result = await ensureCanonicalArticleImageSet(article, { publicDir });

        assert.equal(result.changed, 0);
        assert.equal(result.skipped, true);
        assert.equal(result.reason, 'source_image_fetch_failed');
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

  await t.test('forced image generation falls back to source artwork when image2 is unavailable', async () => {
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

      assert.equal(updated.generatedImageProvider, 'source-image');
      assert.equal(updated.generatedImageModel, 'origin-canonical');
      assert.equal(updated.imageStatus, 'source-canonical');
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
