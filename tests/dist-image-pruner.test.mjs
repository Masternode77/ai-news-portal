import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { pruneUnreferencedDistImages } from '../scripts/prune-dist-images.mjs';

async function fixture() {
  const distDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dist-image-pruner-'));
  await fs.mkdir(path.join(distDir, 'generated', 'articles', 'kept'), { recursive: true });
  await fs.mkdir(path.join(distDir, 'generated', 'articles', 'unused'), { recursive: true });
  await fs.writeFile(path.join(distDir, 'index.html'), '<img src="/generated/articles/kept/hero.webp">');
  await fs.writeFile(path.join(distDir, 'feed.xml'), '<image>/generated/feed.webp</image>');
  await fs.writeFile(path.join(distDir, 'generated', 'articles', 'kept', 'hero.webp'), 'kept');
  await fs.writeFile(path.join(distDir, 'generated', 'articles', 'unused', 'hero.webp'), 'unused');
  await fs.writeFile(path.join(distDir, 'generated', 'feed.webp'), 'feed');
  return distDir;
}

test('dist image pruner retains only generated assets referenced by deployable text', async (t) => {
  const distDir = await fixture();
  t.after(() => fs.rm(distDir, { recursive: true, force: true }));

  const result = await pruneUnreferencedDistImages({ distDir });

  assert.equal(result.scanned, 3);
  assert.deepEqual(result.kept.sort(), [
    '/generated/articles/kept/hero.webp',
    '/generated/feed.webp',
  ]);
  assert.deepEqual(result.removed, ['/generated/articles/unused/hero.webp']);
  await fs.access(path.join(distDir, 'generated', 'articles', 'kept', 'hero.webp'));
  await assert.rejects(fs.access(path.join(distDir, 'generated', 'articles', 'unused', 'hero.webp')));
});

test('dist image pruner dry run reports without deleting', async (t) => {
  const distDir = await fixture();
  t.after(() => fs.rm(distDir, { recursive: true, force: true }));

  const result = await pruneUnreferencedDistImages({ distDir, dryRun: true });

  assert.equal(result.removed.length, 1);
  await fs.access(path.join(distDir, 'generated', 'articles', 'unused', 'hero.webp'));
});
