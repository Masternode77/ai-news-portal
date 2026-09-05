import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildEiaRestorationInventory, eiaRestorationSpecs } from './lib/eia-restoration-inventory.mjs';
import { extractEiaSourceText } from './lib/eia-source-text.mjs';
import { validateExtractionArtifact } from './lib/extraction-artifact.mjs';
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

const MIN_SOURCE_TEXT_CHARS = 500;
const LIVE_FETCH_ATTEMPTS = 2;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// The committed inventory already carries each restoration record with an
// extraction artifact whose hash binds the text to the spec's source URL.
// That text was verified on the run that fetched it, so it is the only
// acceptable stand-in when EIA serves a truncated or error page.
function storedSourceText(spec, storedRecords = []) {
  for (const record of storedRecords) {
    if (!record || record.id !== spec.id) continue;
    const artifact = record.extraction_artifact;
    if (!artifact || artifact.source_url !== spec.sourceUrl) continue;
    const validation = validateExtractionArtifact(artifact);
    if (validation.ok && validation.text.length >= MIN_SOURCE_TEXT_CHARS) return validation.text;
  }
  return '';
}

// Live text wins whenever EIA serves the article. A short or failed fetch
// falls back to the verified stored text instead of failing the whole
// publish run, and the run still fails closed when neither exists.
export async function resolveSourceTexts(specs, { fetchText, storedRecords = [], log = console.error, retryDelayMs = 1500 } = {}) {
  const entries = [];
  for (const spec of specs) {
    let live = '';
    let failure = '';
    for (let attempt = 1; attempt <= LIVE_FETCH_ATTEMPTS && live.length < MIN_SOURCE_TEXT_CHARS; attempt += 1) {
      if (attempt > 1 && retryDelayMs > 0) await sleep(retryDelayMs);
      try {
        live = extractEiaSourceText(await fetchText(spec));
        failure = '';
      } catch (error) {
        failure = error?.code || error?.message || 'fetch_failed';
      }
    }
    if (live.length >= MIN_SOURCE_TEXT_CHARS) {
      entries.push([spec.id, live]);
      continue;
    }
    const reason = failure ? `live fetch failed (${failure})` : `live extraction too short (${live.length})`;
    const stored = storedSourceText(spec, storedRecords);
    assert(stored, `source extraction unavailable: ${spec.id}; ${reason} and the committed inventory holds no verified text`);
    log(`[restore-eia] ${spec.id}: ${reason}; reusing verified text from the committed inventory`);
    entries.push([spec.id, stored]);
  }
  return Object.fromEntries(entries);
}

async function fetchSourceTexts(specs, sources, storedRecords) {
  return resolveSourceTexts(specs, {
    storedRecords,
    fetchText: async (spec) => {
      const fetched = await fetchAuthorizedSourceText({
        url: spec.sourceUrl,
        sourceRegistryId: 'eia-today-in-energy',
      }, {
        sources,
        now: NOW,
        timeoutMs: 20_000,
      });
      return fetched.text;
    },
  });
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

export function reconcileEiaPublicInventory({ records = [], latest = [], archived = [], search = [] } = {}) {
  const restorationIds = new Set(records.map((record) => record.id));
  const withoutRestorationRecords = (items) => items.filter((record) => !restorationIds.has(record.id));

  return {
    latest: [...records, ...withoutRestorationRecords(latest)],
    archived: withoutRestorationRecords(archived),
    search: [...records, ...withoutRestorationRecords(search)],
  };
}

export async function restoreEiaPublicInventory() {
  const specs = eiaRestorationSpecs();
  const sources = await loadSourceRegistry();
  const [latest, archived, search] = await Promise.all([
    readJsonFile(LATEST_NEWS_PATH, []),
    readJsonFile(ARCHIVE_NEWS_PATH, []),
    readJsonFile(SEARCH_INDEX_PATH, []),
  ]);
  const sourceTexts = await fetchSourceTexts(specs, sources, [...latest, ...archived]);
  const verified = verifyAndStamp(buildEiaRestorationInventory(sourceTexts), sources);
  const reconciled = reconcileEiaPublicInventory({ records: verified.records, latest, archived, search });

  await Promise.all([
    writeJsonFile(LATEST_NEWS_PATH, reconciled.latest, { integrityOptions: { sourceRegistry: sources, now: NOW } }),
    writeJsonFile(ARCHIVE_NEWS_PATH, reconciled.archived),
    writeJsonFile(SEARCH_INDEX_PATH, reconciled.search, { integrityOptions: { sourceRegistry: sources, now: NOW } }),
  ]);
  await rebuildTaxonomyPages();

  return {
    restored: verified.records.length,
    longforms: verified.detailRoutes.length,
    signals: verified.records.length - verified.detailRoutes.length,
    homepage: verified.homepage.length,
    rss: verified.rss.length,
    latestTotal: reconciled.latest.length,
    archiveTotal: reconciled.archived.length,
    searchTotal: reconciled.search.length,
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const result = await restoreEiaPublicInventory();
  console.log(JSON.stringify(result, null, 2));
}
