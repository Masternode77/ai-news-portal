import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildEiaRestorationInventory, EIA_RESTORATION_IDS, eiaRestorationSpecs } from './lib/eia-restoration-inventory.mjs';
import { extractEiaSourceText } from './lib/eia-source-text.mjs';
import { fetchAuthorizedSourceText } from './lib/source-text-fetcher.mjs';
import { loadSourceRegistry } from './lib/source-registry.mjs';
import { currentSourceTextAuthorization } from './lib/source-text-publication-authorization.mjs';
import { publicProductFitResult } from './lib/public-product-fit.mjs';
import { finalPublicationIntegrityResult, publicationIntegritySnapshot } from './lib/final-publication-integrity.mjs';
import { buildHomepageFeed } from './lib/homepage-feed-builder.mjs';
import { buildRssItems } from './lib/rss-builder.mjs';
import { buildSitemapEntries } from './lib/sitemap-builder.mjs';
import { readJsonFile, writeJsonFile } from './lib/state-store.mjs';
import { ARCHIVE_NEWS_PATH, LATEST_NEWS_PATH, SEARCH_INDEX_PATH } from './lib/constants.mjs';
import { rebuildTaxonomyPages } from './rebuild-taxonomy-pages.mjs';

const NOW = '2026-08-12T03:00:00.000Z';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function fetchSourceTexts(specs, sources) {
  const entries = [];
  for (const spec of specs) {
    const fetched = await fetchAuthorizedSourceText({
      url: spec.sourceUrl,
      sourceRegistryId: 'eia-today-in-energy',
    }, {
      sources,
      now: NOW,
      timeoutMs: 20_000,
    });
    const text = extractEiaSourceText(fetched.text);
    assert(text.length >= 500, `source extraction too short: ${spec.id} (${text.length})`);
    entries.push([spec.id, text]);
  }
  return Object.fromEntries(entries);
}

function verifyAndStamp(records, sources) {
  const options = { sourceRegistry: sources, now: NOW };
  const recentLongforms = [];
  const stamped = records.map((record) => {
    const authorization = currentSourceTextAuthorization(record, record.extraction_artifact, options);
    assert(authorization.ok, `${record.id}: ${authorization.detail || authorization.reason}`);
    const productFit = publicProductFitResult(record);
    assert(productFit.ok, `${record.id}: ${productFit.reasons.join(', ')}`);
    if (!record.articlePagePublished) return record;
    const integrity = finalPublicationIntegrityResult(record, recentLongforms, options);
    assert(integrity.ok, `${record.id}: ${integrity.reasons.join(', ')}`);
    const checked = { ...record, publication_integrity: publicationIntegritySnapshot(integrity) };
    recentLongforms.unshift(checked);
    return checked;
  });

  const homepage = buildHomepageFeed(stamped, options).items;
  const rss = buildRssItems(stamped, options);
  const detailRoutes = buildSitemapEntries(stamped, options)
    .filter((entry) => entry.loc.startsWith('/news/'));
  assert(homepage.length === 15, `expected 15 homepage cards, received ${homepage.length}`);
  assert(rss.length === 15, `expected 15 RSS items, received ${rss.length}`);
  assert(detailRoutes.length === 5, `expected 5 detail routes, received ${detailRoutes.length}`);
  return { records: stamped, homepage, rss, detailRoutes };
}

export async function restoreEiaPublicInventory() {
  const specs = eiaRestorationSpecs();
  const sources = await loadSourceRegistry();
  const sourceTexts = await fetchSourceTexts(specs, sources);
  const verified = verifyAndStamp(buildEiaRestorationInventory(sourceTexts), sources);
  const restorationIds = new Set(EIA_RESTORATION_IDS);
  const [latest, archived, search] = await Promise.all([
    readJsonFile(LATEST_NEWS_PATH, []),
    readJsonFile(ARCHIVE_NEWS_PATH, []),
    readJsonFile(SEARCH_INDEX_PATH, []),
  ]);
  assert(!archived.some((record) => restorationIds.has(record.id)), 'restoration ID already exists in archive');
  const nextLatest = [...verified.records, ...latest.filter((record) => !restorationIds.has(record.id))];
  const nextSearch = [...verified.records, ...search.filter((record) => !restorationIds.has(record.id))];

  await Promise.all([
    writeJsonFile(LATEST_NEWS_PATH, nextLatest, { integrityOptions: { sourceRegistry: sources, now: NOW } }),
    writeJsonFile(SEARCH_INDEX_PATH, nextSearch, { integrityOptions: { sourceRegistry: sources, now: NOW } }),
  ]);
  await rebuildTaxonomyPages();

  return {
    restored: verified.records.length,
    longforms: verified.detailRoutes.length,
    signals: verified.records.length - verified.detailRoutes.length,
    homepage: verified.homepage.length,
    rss: verified.rss.length,
    latestTotal: nextLatest.length,
    searchTotal: nextSearch.length,
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const result = await restoreEiaPublicInventory();
  console.log(JSON.stringify(result, null, 2));
}
