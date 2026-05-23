import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJsonFile, writeJsonFile } from './lib/state-store.mjs';
import { LATEST_NEWS_PATH, ARCHIVE_NEWS_PATH } from './lib/constants.mjs';
import { buildCategoryPages, archivePages } from './lib/taxonomy-page-builder.mjs';
import { buildCompanyIndex } from './lib/company-entity-index.mjs';
import { buildRegionIndex } from './lib/region-index.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPORT_PATH = path.join(ROOT, 'docs/taxonomy-pages-report.md');

export async function rebuildTaxonomyPages() {
  const [latest, archived] = await Promise.all([
    readJsonFile(LATEST_NEWS_PATH, []),
    readJsonFile(ARCHIVE_NEWS_PATH, []),
  ]);
  const all = [...latest, ...archived];
  const taxonomy = {
    generatedAt: new Date().toISOString(),
    categories: buildCategoryPages(all),
    companies: buildCompanyIndex(all),
    regions: buildRegionIndex(all),
    archive: archivePages(all),
  };
  await writeJsonFile('src/data/taxonomy-pages.json', taxonomy);
  const report = [
    '# Taxonomy Pages Report',
    '',
    `Generated at: ${taxonomy.generatedAt}`,
    `Category pages: ${taxonomy.categories.length}`,
    `Company pages: ${taxonomy.companies.length}`,
    `Region pages: ${taxonomy.regions.length}`,
    `Archive pages: ${taxonomy.archive.length}`,
  ];
  await fs.mkdir(path.dirname(REPORT_PATH), { recursive: true });
  await fs.writeFile(REPORT_PATH, `${report.join('\n')}\n`, 'utf8');
  return taxonomy;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const result = await rebuildTaxonomyPages();
  console.log(`taxonomy pages rebuilt: ${result.categories.length} categories`);
}
