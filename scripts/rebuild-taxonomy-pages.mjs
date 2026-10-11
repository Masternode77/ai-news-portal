import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJsonFile, writeJsonFile } from './lib/state-store.mjs';
import { LATEST_NEWS_PATH, ARCHIVE_NEWS_PATH, AUTHORED_COLUMNS_PATH } from './lib/constants.mjs';
import { buildCategoryPages, archivePages } from './lib/taxonomy-page-builder.mjs';
import { buildCompanyIndex } from './lib/company-entity-index.mjs';
import { buildRegionIndex } from './lib/region-index.mjs';
import { buildHomepageFeed } from './lib/homepage-feed-builder.mjs';
import { buildPublicPublicationCatalog } from './lib/public-publication-catalog.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPORT_PATH = path.join(ROOT, 'docs/taxonomy-pages-report.md');

function sourceSnapshotAt(items = []) {
  const timestamps = items
    .map((article) => new Date(article?.updatedAt || article?.analysisPublishedAt || article?.publishedAt || 0).getTime())
    .filter(Number.isFinite);
  return timestamps.length ? new Date(Math.max(...timestamps)).toISOString() : '';
}

export function renderedTaxonomyDetailRouteCount(taxonomy = {}, publicCatalog = []) {
  const activeCategories = new Set(publicCatalog.map((item) => item.categorySlug).filter(Boolean));
  const activeRegions = new Set(publicCatalog.map((item) => item.regionSlug).filter(Boolean));
  return (taxonomy.categories || []).filter((page) => activeCategories.has(page.slug)).length
    + (taxonomy.regions || []).filter((page) => activeRegions.has(page.slug)).length
    + (taxonomy.companies || [])
      .filter((page) => buildHomepageFeed(page.items || [], { limit: 50, minimumVisible: 0 }).items.length > 0)
      .length;
}

export function buildTaxonomyReport({
  taxonomy = {},
  sourceArtifactRecordCount = 0,
  publicCatalog = [],
  renderedTaxonomyRoutes = 0,
} = {}) {
  const taxonomyRouteShells = (taxonomy.categories?.length || 0)
    + (taxonomy.companies?.length || 0)
    + (taxonomy.regions?.length || 0);
  return [
    '# Taxonomy Source Artifact and Public Route Report',
    '',
    `Source snapshot at: ${taxonomy.generatedAt || 'not recorded'}`,
    '',
    '## Source artifact inventory',
    '',
    'These are internal source-artifact partitions, not reader-facing route counts.',
    `Source artifact category partitions: ${taxonomy.categories?.length || 0}`,
    `Source artifact company partitions: ${taxonomy.companies?.length || 0}`,
    `Source artifact region partitions: ${taxonomy.regions?.length || 0}`,
    `Source artifact archive partitions: ${taxonomy.archive?.length || 0}`,
    `Source artifact records: ${sourceArtifactRecordCount}`,
    '',
    '## Current reader-facing route state',
    '',
    `Public archive route: \`/archive/\` (${publicCatalog.length} rendered eligible records)`,
    `Taxonomy detail routes with rendered eligible records: ${renderedTaxonomyRoutes}`,
    `Static taxonomy route shells: ${taxonomyRouteShells} (not counts of rendered eligible records)`,
  ].join('\n');
}

export async function rebuildTaxonomyPages() {
  const [latest, archived, authoredColumns] = await Promise.all([
    readJsonFile(LATEST_NEWS_PATH, []),
    readJsonFile(ARCHIVE_NEWS_PATH, []),
    readJsonFile(AUTHORED_COLUMNS_PATH, []),
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
  const publicCatalog = buildPublicPublicationCatalog({ articles: all, columns: authoredColumns });
  const renderedTaxonomyRoutes = renderedTaxonomyDetailRouteCount(taxonomy, publicCatalog);
  await writeJsonFile('src/data/taxonomy-pages.json', taxonomy);
  const report = buildTaxonomyReport({
    taxonomy,
    sourceArtifactRecordCount: sourceArtifactIds.size,
    publicCatalog,
    renderedTaxonomyRoutes,
  });
  await fs.mkdir(path.dirname(REPORT_PATH), { recursive: true });
  await fs.writeFile(REPORT_PATH, `${report}\n`, 'utf8');
  return taxonomy;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const result = await rebuildTaxonomyPages();
  console.log(`taxonomy pages rebuilt: ${result.categories.length} categories`);
}
