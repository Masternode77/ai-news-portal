import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJsonFile, writeJsonFile } from './lib/state-store.mjs';
import { LATEST_NEWS_PATH, ARCHIVE_NEWS_PATH } from './lib/constants.mjs';
import { buildCategoryPages, archivePages } from './lib/taxonomy-page-builder.mjs';
import { buildCompanyIndex } from './lib/company-entity-index.mjs';
import { buildRegionIndex } from './lib/region-index.mjs';
import { buildArchiveFeed } from './lib/archive-feed-builder.mjs';
import { buildHomepageFeed } from './lib/homepage-feed-builder.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPORT_PATH = path.join(ROOT, 'docs/taxonomy-pages-report.md');

function sourceSnapshotAt(items = []) {
  const timestamps = items
    .map((article) => new Date(article?.updatedAt || article?.analysisPublishedAt || article?.publishedAt || 0).getTime())
    .filter(Number.isFinite);
  return timestamps.length ? new Date(Math.max(...timestamps)).toISOString() : '';
}

function renderedTaxonomyDetailRouteCount(taxonomy = {}) {
  return [taxonomy.categories, taxonomy.companies, taxonomy.regions]
    .flatMap((pages) => pages || [])
    .filter((page) => buildHomepageFeed(page.items || [], { limit: 50, minimumVisible: 0 }).items.length > 0)
    .length;
}

export async function rebuildTaxonomyPages() {
  const [latest, archived] = await Promise.all([
    readJsonFile(LATEST_NEWS_PATH, []),
    readJsonFile(ARCHIVE_NEWS_PATH, []),
  ]);
  const all = [...latest, ...archived];
  const taxonomy = {
    generatedAt: sourceSnapshotAt(all),
    categories: buildCategoryPages(all),
    companies: buildCompanyIndex(all),
    regions: buildRegionIndex(all),
    archive: archivePages(all),
  };
  const sourceArtifactIds = new Set(taxonomy.archive.flatMap((page) => page.items || []).map((article) => article?.id).filter(Boolean));
  const archiveFeed = buildArchiveFeed(all, { page: 1, pageSize: 50 });
  const taxonomyRouteShells = taxonomy.categories.length + taxonomy.companies.length + taxonomy.regions.length;
  const renderedTaxonomyRoutes = renderedTaxonomyDetailRouteCount(taxonomy);
  await writeJsonFile('src/data/taxonomy-pages.json', taxonomy);
  const report = [
    '# Taxonomy Source Artifact and Public Route Report',
    '',
    `Source snapshot at: ${taxonomy.generatedAt || 'not recorded'}`,
    '',
    '## Source artifact inventory',
    '',
    'These are internal source-artifact partitions, not reader-facing route counts.',
    `Source artifact category partitions: ${taxonomy.categories.length}`,
    `Source artifact company partitions: ${taxonomy.companies.length}`,
    `Source artifact region partitions: ${taxonomy.regions.length}`,
    `Source artifact archive partitions: ${taxonomy.archive.length}`,
    `Source artifact records: ${sourceArtifactIds.size}`,
    '',
    '## Current reader-facing route state',
    '',
    `Public archive route: \`/archive/\` (${archiveFeed.total} rendered eligible records)`,
    `Taxonomy detail routes with rendered eligible records: ${renderedTaxonomyRoutes}`,
    `Static taxonomy route shells: ${taxonomyRouteShells} (not counts of rendered eligible records)`,
  ];
  await fs.mkdir(path.dirname(REPORT_PATH), { recursive: true });
  await fs.writeFile(REPORT_PATH, `${report.join('\n')}\n`, 'utf8');
  return taxonomy;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const result = await rebuildTaxonomyPages();
  console.log(`taxonomy pages rebuilt: ${result.categories.length} categories`);
}
