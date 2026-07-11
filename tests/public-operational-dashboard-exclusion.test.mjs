import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const exists = (relativePath) => fs.existsSync(path.join(root, relativePath));

test('public operational dashboard and its data generator are absent', () => {
  for (const relativePath of [
    'src/pages/dashboard.astro',
    'src/pages/dashboard-fallback.json',
    'public/dashboard-data.json',
    'scripts/sync-dashboard-data.cjs',
  ]) {
    assert.equal(exists(relativePath), false, `${relativePath} must not ship publicly`);
  }
});

test('build and automation do not generate or deploy dashboard snapshots', () => {
  const packageJson = JSON.parse(read('package.json'));
  assert.equal(packageJson.scripts['sync:dashboard-data'], undefined);
  assert.doesNotMatch(packageJson.scripts.build, /dashboard/i);

  const workflow = read('.github/workflows/update-news.yml');
  assert.doesNotMatch(workflow, /\*\/15 \* \* \* \*/);
  assert.doesNotMatch(workflow, /dashboard-sync|dashboard-data\.json|sync:dashboard-data/i);
});

test('sitemap configuration has no obsolete public dashboard exception', () => {
  assert.doesNotMatch(read('astro.config.mjs'), /pathname\s*!==\s*['"]\/dashboard\/['"]/);
});
