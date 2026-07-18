import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  auditPublicSourceImages,
  isPublicSourceCanonicalArticle,
  publicImageFile,
  readSafePublicImage,
  repairPublicSourceImages,
  selectPublicSourceCanonicalArticles,
} from '../scripts/repair-public-source-images.mjs';
import { writeSafePublicFile } from '../scripts/lib/safe-public-file.mjs';

const eligible = {
  id: 'eligible-source-image',
  sourceImage: 'https://media.example/source.jpg',
  generatedImageProvider: 'source-image',
  generatedImageModel: 'origin-canonical',
  imageStatus: 'source-canonical',
};
const publicDecision = (item) => ({ archive: item.hidden !== true });
const canonicalPaths = {
  heroImage: '/generated/articles/eligible-source-image/hero.webp',
  thumbnailImage: '/generated/articles/eligible-source-image/thumbnail.webp',
  ogImage: '/generated/articles/eligible-source-image/og.webp',
  legacyImage: '/generated/eligible-source-image.webp',
};
const expectedBytes = {
  heroImage: Buffer.from('expected-hero'),
  thumbnailImage: Buffer.from('expected-thumbnail'),
  ogImage: Buffer.from('expected-og'),
  legacyImage: Buffer.from('expected-legacy'),
};

function canonicalArticle(overrides = {}) {
  return { ...eligible, title: 'Source image fixture', ...canonicalPaths, ...overrides };
}

async function writeVariantSet(publicDir, values = expectedBytes) {
  for (const [field, publicPath] of Object.entries(canonicalPaths)) {
    if (values[field] === undefined) continue;
    const filePath = publicImageFile(publicDir, publicPath);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, values[field]);
  }
}

async function fixtureCanonicalize(_item, options = {}) {
  await writeVariantSet(options.publicDir);
  return { skipped: false, changed: 4, paths: canonicalPaths };
}

async function makeProject() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'compute-current-provenance-test-'));
  const publicDir = path.join(root, 'public');
  await fs.mkdir(publicDir, { recursive: true });
  return { root, publicDir };
}

test('public source provenance audit selects each visible source-canonical article once', () => {
  const duplicate = { ...eligible, title: 'Duplicate archive copy' };
  const hidden = { ...eligible, id: 'hidden-source-image', hidden: true };
  const generated = { ...eligible, id: 'image2-article', generatedImageProvider: 'image2' };
  const invalidSource = { ...eligible, id: 'invalid-source', sourceImage: 'file:///tmp/source.jpg' };
  const missingSource = { ...eligible, id: 'missing-source', sourceImage: '' };

  const selected = selectPublicSourceCanonicalArticles([
    [eligible, hidden, generated],
    [duplicate, invalidSource, missingSource],
  ], { publicDecision });

  assert.deepEqual(
    selected.map((item) => item.id),
    ['eligible-source-image', 'invalid-source', 'missing-source'],
  );
  assert.equal(isPublicSourceCanonicalArticle(eligible, { publicDecision }), true);
  assert.equal(isPublicSourceCanonicalArticle(hidden, { publicDecision }), false);
});

test('provenance CLI fails closed when source-canonical metadata has an invalid URL', async () => {
  const { root } = await makeProject();
  const dataDir = path.join(root, 'src/data');
  const scriptPath = path.resolve('scripts/repair-public-source-images.mjs');
  try {
    const repositoryCollections = await Promise.all([
      fs.readFile(path.resolve('src/data/latest-news.json'), 'utf8').then(JSON.parse),
      fs.readFile(path.resolve('src/data/archived-news.json'), 'utf8').then(JSON.parse),
    ]);
    const publicCanonical = repositoryCollections
      .flat()
      .find((item) => isPublicSourceCanonicalArticle(item));
    assert.ok(publicCanonical, 'repository fixture requires a public source-canonical article');
    await fs.mkdir(dataDir, { recursive: true });
    await Promise.all([
      fs.writeFile(path.join(dataDir, 'latest-news.json'), JSON.stringify([
        { ...publicCanonical, id: 'invalid-source-url', sourceImage: 'file:///tmp/source.jpg' },
      ])),
      fs.writeFile(path.join(dataDir, 'archived-news.json'), '[]'),
    ]);
    const result = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [scriptPath], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (chunk) => { stdout += chunk; });
      child.stderr.on('data', (chunk) => { stderr += chunk; });
      child.on('error', reject);
      child.on('close', (code) => resolve({ code, stdout, stderr }));
    });

    assert.equal(result.code, 1, result.stderr || result.stdout);
    const receipt = JSON.parse(result.stdout);
    assert.equal(receipt.summary.candidates, 1);
    assert.equal(receipt.summary.unavailable, 1);
    assert.equal(receipt.failures[0].reason, 'invalid_source_image_url');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('public image paths stay inside the selected public directory', () => {
  const publicDir = path.resolve('/tmp/compute-current-public');
  assert.equal(
    publicImageFile(publicDir, '/generated/articles/example/hero.webp'),
    path.join(publicDir, 'generated/articles/example/hero.webp'),
  );
  assert.throws(
    () => publicImageFile(publicDir, '/../private-key'),
    /escapes public directory/,
  );
  assert.throws(
    () => publicImageFile(publicDir, 'generated/hero.webp'),
    /must be absolute/,
  );
});

test('provenance audit checks hero, thumbnail, OpenGraph, and legacy variants', async () => {
  const { root, publicDir } = await makeProject();
  try {
    await writeVariantSet(publicDir, {
      ...expectedBytes,
      thumbnailImage: Buffer.from('stale-thumbnail'),
    });
    const audit = await auditPublicSourceImages({
      collections: [[canonicalArticle()]],
      publicDecision,
      publicDir,
      canonicalize: fixtureCanonicalize,
      concurrency: 1,
    });

    assert.equal(audit.summary.candidates, 1);
    assert.equal(audit.summary.mismatches, 1);
    assert.deepEqual(
      Object.fromEntries(audit.results[0].variants.map((variant) => [variant.key, variant.status])),
      { hero: 'match', thumbnail: 'mismatch', og: 'match', legacy: 'match' },
    );
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('apply recreates a missing local variant from the preflight output', async () => {
  const { root, publicDir } = await makeProject();
  try {
    await writeVariantSet(publicDir, { ...expectedBytes, thumbnailImage: undefined });
    const result = await repairPublicSourceImages({
      apply: true,
      collections: [[canonicalArticle()]],
      publicDecision,
      publicDir,
      canonicalize: fixtureCanonicalize,
      concurrency: 1,
    });

    assert.deepEqual(result.repaired, ['eligible-source-image']);
    assert.equal(result.before.summary.missing, 1);
    assert.equal(result.after.summary.matches, 1);
    assert.deepEqual(
      await fs.readFile(publicImageFile(publicDir, canonicalPaths.thumbnailImage)),
      expectedBytes.thumbnailImage,
    );
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('apply performs no mutation when any source fails preflight', async () => {
  const { root, publicDir } = await makeProject();
  const original = Buffer.from('original-hero');
  try {
    await writeVariantSet(publicDir, { ...expectedBytes, heroImage: original });
    const unavailable = canonicalArticle({
      id: 'unavailable-source-image',
      sourceImage: 'https://media.example/unavailable.jpg',
      heroImage: '/generated/articles/unavailable/hero.webp',
      thumbnailImage: '/generated/articles/unavailable/thumbnail.webp',
      ogImage: '/generated/articles/unavailable/og.webp',
      legacyImage: '/generated/unavailable.webp',
    });
    await assert.rejects(
      () => repairPublicSourceImages({
        apply: true,
        collections: [[canonicalArticle(), unavailable]],
        publicDecision,
        publicDir,
        canonicalize: async (item, options) => {
          if (item.id === unavailable.id) return { skipped: true, reason: 'source_image_fetch_failed' };
          return fixtureCanonicalize(item, options);
        },
        concurrency: 1,
      }),
      /Cannot apply source-image repair/,
    );
    assert.deepEqual(
      await fs.readFile(publicImageFile(publicDir, canonicalPaths.heroImage)),
      original,
    );
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('apply rolls back earlier writes when a later promotion fails', async () => {
  const { root, publicDir } = await makeProject();
  const originals = Object.fromEntries(
    Object.keys(expectedBytes).map((field) => [field, Buffer.from(`original-${field}`)]),
  );
  let writes = 0;
  try {
    await writeVariantSet(publicDir, originals);
    await assert.rejects(
      () => repairPublicSourceImages({
        apply: true,
        collections: [[canonicalArticle()]],
        publicDecision,
        publicDir,
        canonicalize: fixtureCanonicalize,
        concurrency: 1,
        writePublicFile: async (...args) => {
          writes += 1;
          if (writes === 2) throw new Error('simulated promotion failure');
          return writeSafePublicFile(...args.slice(0, 3));
        },
      }),
      /simulated promotion failure/,
    );
    for (const [field, publicPath] of Object.entries(canonicalPaths)) {
      assert.deepEqual(await fs.readFile(publicImageFile(publicDir, publicPath)), originals[field]);
    }
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('apply rolls back the batch when post-promotion verification fails', async () => {
  const { root, publicDir } = await makeProject();
  const originals = Object.fromEntries(
    Object.keys(expectedBytes).map((field) => [field, Buffer.from(`original-${field}`)]),
  );
  try {
    await writeVariantSet(publicDir, originals);
    await assert.rejects(
      () => repairPublicSourceImages({
        apply: true,
        collections: [[canonicalArticle()]],
        publicDecision,
        publicDir,
        canonicalize: fixtureCanonicalize,
        concurrency: 1,
        writePublicFile: async (rootDir, target, bytes, operation) => writeSafePublicFile(
          rootDir,
          target,
          operation.key === 'og' ? Buffer.from('corrupt-og') : bytes,
        ),
      }),
      /did not converge/,
    );
    for (const [field, publicPath] of Object.entries(canonicalPaths)) {
      assert.deepEqual(await fs.readFile(publicImageFile(publicDir, publicPath)), originals[field]);
    }
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('provenance audit rejects a local image symlink', async () => {
  const { root, publicDir } = await makeProject();
  const external = path.join(root, 'outside.webp');
  try {
    await writeVariantSet(publicDir);
    await fs.writeFile(external, expectedBytes.heroImage);
    await fs.rm(publicImageFile(publicDir, canonicalPaths.heroImage));
    await fs.symlink(external, publicImageFile(publicDir, canonicalPaths.heroImage));
    const audit = await auditPublicSourceImages({
      collections: [[canonicalArticle()]],
      publicDecision,
      publicDir,
      canonicalize: fixtureCanonicalize,
      concurrency: 1,
    });

    assert.equal(audit.summary.unavailable, 1);
    assert.equal(audit.results[0].status, 'unsafe-local-image');
    assert.equal(audit.results[0].variants.find((variant) => variant.key === 'hero').status, 'unsafe-local-image');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('bounded provenance read rejects a parent swap before opening the file', async () => {
  const { root, publicDir } = await makeProject();
  const safeDir = path.join(publicDir, 'generated', 'swap');
  const outsideDir = path.join(root, 'outside');
  const publicPath = '/generated/swap/hero.webp';
  try {
    await fs.mkdir(safeDir, { recursive: true });
    await fs.mkdir(outsideDir, { recursive: true });
    await fs.writeFile(path.join(safeDir, 'hero.webp'), Buffer.from('inside'));
    await fs.writeFile(path.join(outsideDir, 'hero.webp'), Buffer.from('outside'));

    await assert.rejects(
      () => readSafePublicImage(publicDir, publicPath, {
        beforeOpen: async () => {
          await fs.rename(safeDir, `${safeDir}-original`);
          await fs.symlink(outsideDir, safeDir);
        },
      }),
      /identity changed|unsafe/i,
    );
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('bounded provenance read rejects a file that grows after metadata validation', async () => {
  const { root, publicDir } = await makeProject();
  const publicPath = '/generated/growing.webp';
  const filePath = publicImageFile(publicDir, publicPath);
  try {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, Buffer.from('12345678'));
    await assert.rejects(
      () => readSafePublicImage(publicDir, publicPath, {
        maxBytes: 8,
        beforeOpen: async () => fs.appendFile(filePath, '9'),
      }),
      /bounded read limit|unsafe/i,
    );
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
