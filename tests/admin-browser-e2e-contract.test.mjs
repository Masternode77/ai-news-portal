import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { ADMIN_BROWSER_E2E_SCENARIOS } from '../scripts/qa-admin-browser-e2e.mjs';

const harness = fs.readFileSync(new URL('../scripts/qa-admin-browser-e2e.mjs', import.meta.url), 'utf8');

const requiredScenarios = [
  'unauthorized redirect',
  'login succeeds with seeded test admin',
  'create draft',
  'edit title',
  'edit body',
  'edit category',
  'edit source',
  'preview draft',
  'upload image',
  'save draft',
  'publish article',
  'unpublish article',
  'soft delete',
  'restore',
  'revision display',
  'permanent-delete confirmation',
  'logout/session rejection',
];

test('admin browser E2E harness enumerates all 17 required local admin scenarios', () => {
  assert.deepEqual(ADMIN_BROWSER_E2E_SCENARIOS, requiredScenarios);
  assert.equal(new Set(ADMIN_BROWSER_E2E_SCENARIOS).size, 17);
  for (const label of requiredScenarios) {
    assert.match(harness, new RegExp(`record\\(checks, '${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'`));
  }
});

test('admin browser E2E harness keeps public rebuild and discovery outside local-only scope', () => {
  assert.match(harness, /publicRebuildDiscovery:\s*'out-of-scope'/);
  assert.match(harness, /localOnly:\s*true/);
  assert.match(harness, /public rebuild and discovery assertions are outside this local-only admin harness/);
  assert.doesNotMatch(harness, /npm run build/);
});

test('admin browser E2E harness is bounded to local real handlers and isolated test storage', () => {
  for (const route of [
    'loginHandler',
    'articlesHandler',
    'articleHandler',
    'mediaHandler',
    'revisionsHandler',
    'auditHandler',
    'dashboardHandler',
    'operationsHandler',
  ]) {
    assert.match(harness, new RegExp(route));
  }
  assert.match(harness, /createLocalAdminStorage\(\{ filePath: storagePath \}\)/);
  assert.match(harness, /createAdminMediaStorage\(\{ provider: 'local', directory: mediaDir \}\)/);
  assert.match(harness, /configureAdminStorageForTests\(null\)/);
  assert.match(harness, /configureAdminMediaStorageForTests\(null\)/);
  assert.match(harness, /restoreEnv\(previousEnv\)/);
});

test('admin browser E2E harness loads Playwright without declaring a new dependency', () => {
  assert.match(harness, /await import\('playwright'\)/);
  assert.match(harness, /PLAYWRIGHT_NODE_MODULES/);
  assert.match(harness, /os\.homedir\(\)/);
  assert.match(harness, /Playwright is unavailable/);
  assert.match(harness, /createRequire/);
  assert.doesNotMatch(harness, /\/Users\/josh/);
});

test('admin browser E2E harness writes evidence and closes runtime resources on failure paths', () => {
  assert.match(harness, /fs\.writeFile\(outPath/);
  assert.match(harness, /fs\.rm\(screenshotDir, \{ recursive: true, force: true \}\)/);
  assert.match(harness, /page\.screenshot/);
  assert.match(harness, /await browser\.close\(\)\.catch/);
  assert.match(harness, /await closeServer\(server\)\.catch/);
  assert.match(harness, /finally\s*\{/);
});
