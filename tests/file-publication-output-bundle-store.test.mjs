import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  FilePublicationOutputBundleError,
  FilePublicationOutputBundleStore,
} from '../src/core/state/index.mjs';

test('publication output bundle restores missing and mismatched run files', async (t) => {
  const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'publication-output-project-'));
  t.after(() => fs.rm(projectRoot, { recursive: true, force: true }));
  const store = new FilePublicationOutputBundleStore(path.join(projectRoot, '.cache/bundles'), {
    projectRoot,
  });
  await fs.mkdir(path.join(projectRoot, 'src/data'), { recursive: true });
  await fs.writeFile(path.join(projectRoot, 'src/data/latest.json'), 'original latest\n');
  await fs.writeFile(path.join(projectRoot, 'src/data/archive.json'), 'original archive\n');
  const manifest = await store.capture('cycle-1', [
    'src/data/latest.json',
    'src/data/archive.json',
  ]);

  await fs.writeFile(path.join(projectRoot, 'src/data/latest.json'), 'corrupt\n');
  await fs.rm(path.join(projectRoot, 'src/data/archive.json'));
  const result = await store.verifyAndRestore(manifest);

  assert.deepEqual(result.restored, ['src/data/archive.json', 'src/data/latest.json']);
  assert.equal(await fs.readFile(path.join(projectRoot, 'src/data/latest.json'), 'utf8'), 'original latest\n');
  assert.equal(await fs.readFile(path.join(projectRoot, 'src/data/archive.json'), 'utf8'), 'original archive\n');
});

test('publication output bundle rejects paths outside the project root', async (t) => {
  const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'publication-output-project-'));
  t.after(() => fs.rm(projectRoot, { recursive: true, force: true }));
  const store = new FilePublicationOutputBundleStore(path.join(projectRoot, '.cache/bundles'), {
    projectRoot,
  });

  await assert.rejects(
    () => store.capture('cycle-1', ['../outside.json']),
    (error) => error instanceof FilePublicationOutputBundleError
      && error.code === 'invalid_output_bundle_path',
  );
});
