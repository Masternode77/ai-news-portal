import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJsonFile, writeJsonFile } from './lib/state-store.mjs';
import { LATEST_NEWS_PATH, ARCHIVE_NEWS_PATH } from './lib/constants.mjs';
import { buildTaxonomyProjection, taxonomyGeneratedAt } from './lib/taxonomy-projection.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_PATHS = {
  latest: path.join(ROOT, LATEST_NEWS_PATH),
  archive: path.join(ROOT, ARCHIVE_NEWS_PATH),
  taxonomy: path.join(ROOT, 'src/data/taxonomy-pages.json'),
  report: path.join(ROOT, 'docs/taxonomy-pages-report.md'),
};

export { taxonomyGeneratedAt };

export async function rebuildTaxonomyPages(options = {}) {
  const paths = { ...DEFAULT_PATHS, ...(options.paths || {}) };
  const [latest, archived] = await Promise.all([
    readJsonFile(paths.latest, []),
    readJsonFile(paths.archive, []),
  ]);
  const all = [...latest, ...archived];
  const taxonomy = buildTaxonomyProjection(all);
  await writeJsonFile(paths.taxonomy, taxonomy);
  const report = [
    '# Taxonomy Pages Report',
    '',
    `Generated at: ${taxonomy.generatedAt}`,
    `Category pages: ${taxonomy.categories.length}`,
    `Company pages: ${taxonomy.companies.length}`,
    `Region pages: ${taxonomy.regions.length}`,
    `Archive pages: ${taxonomy.archive.length}`,
  ];
  await fs.mkdir(path.dirname(paths.report), { recursive: true });
  await fs.writeFile(paths.report, `${report.join('\n')}\n`, 'utf8');
  return taxonomy;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const result = await rebuildTaxonomyPages();
  console.log(`taxonomy pages rebuilt: ${result.categories.length} categories`);
}
