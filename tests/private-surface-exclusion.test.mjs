import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { auditAdminExclusion } from '../scripts/audit-admin-exclusion.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const LEGACY_ROUTE_SOURCES = [
  'src/pages/admin/edit/[id].astro',
  'src/pages/admin/claim-ledger.astro',
  'src/pages/admin/content-quality.astro',
  'src/pages/admin/content-quality/[id].astro',
  'src/pages/admin/editorial-cycles.astro',
  'src/pages/admin/editorial-cycles/[id].astro',
  'src/pages/admin/signal-clusters.astro',
  'src/pages/admin/source-health.astro',
];
const OPERATIONAL_SNAPSHOT_PATHS = [
  'src/data/cron-registry-snapshot-latest.json',
  'src/data/cron-registry-snapshot-2026-08-09.json',
  'public/cron-registry-snapshot-latest.json',
  'public/dashboard-data.json',
  'public/dashboard-snapshot.json',
];
const OPERATIONAL_SNAPSHOT_NAME = /^(?:cron-registry-snapshot|dashboard-data|dashboard-snapshot).*\.json$/;
const ROOT_MANIFEST_EXCLUDED_DIRECTORIES = new Set([
  '.astro',
  '.cache',
  '.codex',
  '.git',
  '.omo',
  '.vercel',
  '.worktrees',
  'artifacts',
  'coverage',
  'dist',
  'evidence',
  'node_modules',
  'outputs',
]);
const REQUIRED_SNAPSHOT_IGNORE_RULES = [
  '**/cron-registry-snapshot*.json',
  '**/dashboard-data*.json',
  '**/dashboard-snapshot*.json',
];

function walkCandidateFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()
      && directory === ROOT
      && ROOT_MANIFEST_EXCLUDED_DIRECTORIES.has(entry.name)) return [];
    return entry.isDirectory() ? walkCandidateFiles(entryPath) : [entryPath];
  });
}

function snapshotIgnoreRuleMatches(filePath, rule) {
  const [prefix, suffix] = path.basename(rule).split('*');
  const fileName = path.basename(filePath);
  return fileName.startsWith(prefix) && fileName.endsWith(suffix);
}

function walkJsonFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    return entry.isDirectory() ? walkJsonFiles(entryPath) : entry.name.endsWith('.json') ? [entryPath] : [];
  });
}

function containsOperationalSnapshotSchema(filePath) {
  const value = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (!value || typeof value !== 'object' || !Array.isArray(value.jobs)) return false;
  return value.jobs.some((job) => job
    && typeof job === 'object'
    && 'schedule' in job
    && 'payload' in job
    && 'delivery' in job
    && 'sessionTarget' in job);
}

async function writeFixture(distDir, relativePath, contents) {
  const filePath = path.join(distDir, relativePath);
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  await fsp.writeFile(filePath, contents, 'utf8');
}

test('deployable source manifest excludes the public operations dashboard and legacy static private routes', () => {
  // Given: the tracked source files and build/deployment configuration.
  const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const workflow = fs.readFileSync(path.join(ROOT, '.github/workflows/update-news.yml'), 'utf8');
  const astroConfig = fs.readFileSync(path.join(ROOT, 'astro.config.mjs'), 'utf8');

  // When: the deployable source manifest is inspected.
  const forbiddenFiles = [
    'public/dashboard-data.json',
    'src/pages/dashboard.astro',
    'scripts/sync-dashboard-data.cjs',
    ...LEGACY_ROUTE_SOURCES,
  ].filter((relativePath) => fs.existsSync(path.join(ROOT, relativePath)));

  // Then: no generator, raw public artifact, or build/deployment hook remains.
  assert.deepEqual(forbiddenFiles, []);
  assert.equal(packageJson.scripts['sync:dashboard-data'], undefined);
  assert.doesNotMatch(packageJson.scripts.build, /dashboard/i);
  assert.doesNotMatch(workflow, /dashboard-data|sync:dashboard-data|dashboard-sync/i);
  assert.doesNotMatch(astroConfig, /pathname\s*!==\s*['"]\/dashboard\//);
});

test('admin exclusion audit rejects stale public operations artifacts but allows authenticated admin shells', async () => {
  // Given: a built output containing allowed admin shells plus stale private static artifacts.
  const distDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'compute-current-private-surface-'));
  const noindexShell = '<html><head><meta name="robots" content="noindex,nofollow"></head><body>Authenticated shell</body></html>';
  await writeFixture(distDir, 'robots.txt', 'User-agent: *\nDisallow: /admin\nDisallow: /api/admin\n');
  await writeFixture(distDir, 'sitemap.xml', '<urlset><url><loc>https://www.computecurrent.com/</loc></url></urlset>');
  await writeFixture(distDir, 'admin/index.html', noindexShell);
  await writeFixture(distDir, 'admin/dashboard/index.html', noindexShell);
  await writeFixture(distDir, 'dashboard-data.json', '{"private":"operations"}');
  await writeFixture(distDir, 'dashboard/index.html', noindexShell);
  await writeFixture(distDir, 'admin/content-quality/private-record/index.html', noindexShell);

  // When: the built output is audited.
  const result = await auditAdminExclusion({ distDir });

  // Then: stale public/private artifacts fail closed without rejecting the authenticated shells.
  assert.equal(result.ok, false);
  assert.ok(result.failures.some((failure) => failure.includes('/dashboard-data.json')));
  assert.ok(result.failures.some((failure) => failure.includes('/dashboard/')));
  assert.ok(result.failures.some((failure) => failure.includes('/admin/content-quality/private-record/')));
  assert.ok(result.failures.every((failure) => !failure.includes('/admin/dashboard/')));
});

test('candidate and build-source manifests exclude operational cron and dashboard snapshots', () => {
  // Given: the archive candidate, deployable JSON sources, and snapshot ignore policy.
  const candidateSnapshotPaths = walkCandidateFiles(ROOT)
    .filter((filePath) => OPERATIONAL_SNAPSHOT_NAME.test(path.basename(filePath)))
    .map((filePath) => path.relative(ROOT, filePath));
  const jsonSources = [
    ...walkJsonFiles(path.join(ROOT, 'public')),
    ...walkJsonFiles(path.join(ROOT, 'src/data')),
    ...walkJsonFiles(path.join(ROOT, 'src/pages')),
  ];

  // When: candidate paths, source JSON schemas, and representative ignored paths are checked.
  const sensitiveSchemaFiles = jsonSources
    .filter(containsOperationalSnapshotSchema)
    .map((filePath) => path.relative(ROOT, filePath));
  const ignoreRules = new Set(fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8').split(/\r?\n/));
  const missingSnapshotIgnoreRules = REQUIRED_SNAPSHOT_IGNORE_RULES.filter((rule) => !ignoreRules.has(rule));

  // Then: no snapshot ships in the candidate or build sources, and ignore rules reject representative clones.
  assert.deepEqual(candidateSnapshotPaths, []);
  assert.deepEqual(sensitiveSchemaFiles, []);
  assert.deepEqual(missingSnapshotIgnoreRules, []);
  assert.equal(OPERATIONAL_SNAPSHOT_PATHS.every((filePath) => (
    REQUIRED_SNAPSHOT_IGNORE_RULES.some((rule) => snapshotIgnoreRuleMatches(filePath, rule))
  )), true);
});
