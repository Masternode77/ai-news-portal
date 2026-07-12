import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ARCHIVE_NEWS_PATH, LATEST_NEWS_PATH } from './lib/constants.mjs';
import { readJsonFile } from './lib/state-store.mjs';
import { applyLegacyMigrationPlan, buildLegacyMigrationPlan, LEGACY_MIGRATION_ACTIONS } from './lib/legacy-migration.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPORT_PATH = path.join(ROOT, 'docs/legacy-migration-report.md');
const ROLLBACK_PATH = path.join(ROOT, 'docs/legacy-migration-rollback.json');

function arg(name) {
  return process.argv.includes(name);
}

function byDateDesc(a, b) {
  return new Date(b.analysisPublishedAt || b.publishedAt || b.updatedAt || 0) - new Date(a.analysisPublishedAt || a.publishedAt || a.updatedAt || 0);
}

function uniqueById(items = []) {
  const seen = new Set();
  return items.filter((item) => {
    if (!item?.id || seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

async function loadArticles() {
  const [latest, archived] = await Promise.all([
    readJsonFile(LATEST_NEWS_PATH, []),
    readJsonFile(ARCHIVE_NEWS_PATH, []),
  ]);
  return uniqueById([...latest, ...archived]).sort(byDateDesc);
}

function namedExamples(plan = {}) {
  return ['NetApp', 'AppStoreAI', 'LandAndExpand'].map((key) => {
    const record = plan.examples?.[key];
    return `- ${key}: ${record ? `${record.action} - ${record.title}` : 'not found in audit window'}`;
  });
}

function report(plan = {}, applied = {}, mode = 'dry-run') {
  return [
    '# Legacy Migration Report',
    '',
    `Generated at: ${plan.generatedAt}`,
    `Mode: ${mode}`,
    `Audit limit: ${plan.auditLimit}`,
    `Regeneration limit: ${plan.regenerationLimit}`,
    '',
    '## Classification Counts',
    '',
    ...LEGACY_MIGRATION_ACTIONS.map((action) => `- ${action}: ${plan.counts?.[action] || 0}`),
    '',
    '## Named Brief Examples',
    '',
    ...namedExamples(plan),
    '',
    '## Artifact Refresh',
    '',
    ...((applied.cacheReport?.updatedArtifacts || []).map((name) => `- ${name}`)),
    '',
    `Rollback records: ${applied.rollback?.length || 0}`,
    `Search index records: ${applied.searchIndex?.length || 0}`,
    `Sitemap entries: ${applied.sitemapEntries?.length || 0}`,
    `RSS items: ${applied.rssItems?.length || 0}`,
    '',
  ].join('\n');
}

async function writeReport(plan, applied, mode) {
  await fs.mkdir(path.dirname(REPORT_PATH), { recursive: true });
  await fs.writeFile(REPORT_PATH, report(plan, applied, mode), 'utf8');
  await fs.writeFile(ROLLBACK_PATH, `${JSON.stringify(applied.rollback || [], null, 2)}\n`, 'utf8');
}

if (arg('--apply')) {
  throw new Error('legacy migration apply mode is disabled; use the canonical content lifecycle');
}
const all = await loadArticles();
const plan = buildLegacyMigrationPlan(all, { auditLimit: 200, regenerationLimit: 100 });
const applied = applyLegacyMigrationPlan(plan);
await writeReport(plan, applied, 'diagnostic');

console.log(`legacy migration diagnostic: ${JSON.stringify(plan.counts)}`);
console.log(`report: ${REPORT_PATH}`);
