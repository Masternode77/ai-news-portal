import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ARCHIVE_NEWS_PATH, LATEST_NEWS_PATH } from './lib/constants.mjs';
import { readJsonFile } from './lib/state-store.mjs';
import { applyLegacyMigrationPlan, buildLegacyMigrationPlan } from './lib/legacy-migration.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPORT_PATH = path.join(ROOT, 'docs/latest100-regeneration-report.md');

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

function imageReady(article = {}) {
  return Boolean(article.heroImage || article.generatedImage || article.thumbnailImage || article.ogImage);
}

function report(plan = {}, applied = {}) {
  const eligibleIds = new Set((plan.latest100Eligible || []).map((record) => record.id));
  const eligibleArticles = (applied.updatedArticles || []).filter((article) => eligibleIds.has(article.id));
  const missingImages = eligibleArticles.filter((article) => !imageReady(article));
  const regeneration = (plan.latest100Eligible || []).filter((record) => record.action.startsWith('regenerate_'));
  return [
    '# Latest 100 Regeneration Report',
    '',
    `Generated at: ${plan.generatedAt}`,
    `Eligible records: ${eligibleArticles.length}`,
    `Regeneration requests: ${regeneration.length}`,
    `Image-ready records: ${eligibleArticles.length - missingImages.length}`,
    `Missing images after fallback assignment: ${missingImages.length}`,
    '',
    '## Regeneration Queue',
    '',
    ...regeneration.slice(0, 100).map((record) => `- ${record.action}: ${record.title}`),
    '',
  ].join('\n');
}

const all = await loadArticles();
const plan = buildLegacyMigrationPlan(all, { auditLimit: 200, regenerationLimit: 100 });
const applied = applyLegacyMigrationPlan(plan);
await fs.mkdir(path.dirname(REPORT_PATH), { recursive: true });
await fs.writeFile(REPORT_PATH, report(plan, applied), 'utf8');

const eligibleCount = plan.latest100Eligible.length;
const imageReadyCount = applied.updatedArticles
  .filter((article) => new Set(plan.latest100Eligible.map((record) => record.id)).has(article.id))
  .filter(imageReady).length;
console.log(`latest100 regeneration report: eligible=${eligibleCount} imageReady=${imageReadyCount}`);
console.log(`report: ${REPORT_PATH}`);
