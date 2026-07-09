import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { projectConfigPath, projectRoot } from '../scripts/lib/project-root.mjs';

test('resolves project paths from Astro prerender output chunks', () => {
  const root = process.cwd();
  const bundledUrl = pathToFileURL(
    path.join(root, 'dist/.prerender/chunks/seo-quality-policy_fake.mjs')
  ).href;
  const bannedPhrasePath = projectConfigPath(bundledUrl, 'bannedPhrases.yml');

  assert.equal(projectRoot(bundledUrl), root);
  assert.equal(bannedPhrasePath, path.join(root, 'config/bannedPhrases.yml'));
  assert.equal(fs.existsSync(bannedPhrasePath), true);
});

test('falls back to the current working tree when bundle chunks live outside the repo', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'compute-current-root-'));
  try {
    const externalUrl = pathToFileURL(path.join(tempDir, 'bundle/chunk.mjs')).href;
    assert.equal(projectRoot(externalUrl), process.cwd());
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('keeps the historical relative fallback when no root markers exist', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'compute-current-no-root-'));
  try {
    const modulePath = path.join(tempDir, 'pkg/dist/chunks/guard.mjs');
    const cwdPath = path.join(tempDir, 'cwd');
    fs.mkdirSync(cwdPath, { recursive: true });

    assert.equal(
      projectRoot(pathToFileURL(modulePath).href, { cwd: cwdPath }),
      path.join(tempDir, 'pkg')
    );
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
