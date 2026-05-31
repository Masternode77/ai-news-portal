import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ARCHIVE_NEWS_PATH, LATEST_NEWS_PATH } from './lib/constants.mjs';
import { readJsonFile, writeJsonFile } from './lib/state-store.mjs';
import { applyLegacyMigrationPlan, buildLegacyMigrationPlan } from './lib/legacy-migration.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPORT_PATH = path.join(ROOT, 'docs/missing-images-report.md');

function arg(name) {
  return process.argv.includes(name);
}

function byDateDesc(a, b) {
  return new Date(b.analysisPublishedAt || b.publishedAt || b.updatedAt || 0) - new Date(a.analysisPublishedAt || a.publishedAt || a.updatedAt || 0);
}

function imageReady(article = {}) {
  return Boolean(article.heroImage || article.generatedImage || article.thumbnailImage || article.ogImage);
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

function report(plan = {}, applied = {}) {
  const eligibleIds = new Set((plan.latest100Eligible || []).map((record) => record.id));
  const eligible = (applied.updatedArticles || []).filter((article) => eligibleIds.has(article.id));
  const assignments = eligible.filter((article) => article.imageStatus === 'fallback');
  const missingAfter = eligible.filter((article) => !imageReady(article));
  return [
    '# Missing Images Report',
    '',
    `Generated at: ${plan.generatedAt}`,
    `Latest 100 eligible: ${eligible.length}`,
    `Fallback assignments: ${assignments.length}`,
    `Missing after assignment: ${missingAfter.length}`,
    '',
    '## Assigned Fallbacks',
    '',
    ...assignments.map((article) => `- ${article.id}: ${article.heroImage}`),
    '',
  ].join('\n');
}

async function applyWrites(applied = {}) {
  await writeJsonFile(LATEST_NEWS_PATH, applied.updatedArticles.slice(0, 50));
  await writeJsonFile(ARCHIVE_NEWS_PATH, applied.updatedArticles.slice(50));
}

const dryRun = arg('--dry-run') || !arg('--apply');
const all = await loadArticles();
const plan = buildLegacyMigrationPlan(all, { auditLimit: 200, regenerationLimit: 100 });
const applied = applyLegacyMigrationPlan(plan);
await fs.mkdir(path.dirname(REPORT_PATH), { recursive: true });
await fs.writeFile(REPORT_PATH, report(plan, applied), 'utf8');
if (!dryRun) await applyWrites(applied);

console.log(`missing images ${dryRun ? 'dry run' : 'applied'}: ${plan.latest100Eligible.length} eligible`);
console.log(`report: ${REPORT_PATH}`);
