import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runEditorialCycle } from './lib/editorial-cycle.mjs';
import { appendEditorialCycle } from './lib/editorial-cycle-store.mjs';
import { writeSignalClusters } from './lib/signal-cluster-store.mjs';
import { writeClaimLedger } from './lib/claim-ledger.mjs';
import { readJsonFile, writeJsonFile } from './lib/state-store.mjs';
import { LATEST_NEWS_PATH, ARCHIVE_NEWS_PATH, SEARCH_INDEX_PATH } from './lib/constants.mjs';
import { AUTONOMOUS_VERSION } from './lib/autonomous-desk-utils.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function uniqueById(items = []) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    if (!item?.id || seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
}

function publicSearchEligible(article = {}) {
  return article?.id
    && article.generation_version === AUTONOMOUS_VERSION
    && article.archiveOnly !== true
    && article.public_status !== 'archive_only_noindex'
    && article.public_status !== 'quarantined'
    && (article.articlePagePublished !== false || article.public_status === 'watchlist');
}

export async function runAndPersistEditorialCycle(options = {}) {
  const [latest, archived] = await Promise.all([
    readJsonFile(LATEST_NEWS_PATH, []),
    readJsonFile(ARCHIVE_NEWS_PATH, []),
  ]);
  const result = await runEditorialCycle({
    useLive: process.env.AUTONOMOUS_DESK_LIVE_SCAN === '1',
    recent: latest.filter((article) => article.generation_version === AUTONOMOUS_VERSION).slice(0, 20),
    ...options,
  });

  const publishedIds = new Set(result.publishedAnalyses.map((article) => article.id));
  const latestOut = uniqueById([...result.publishedAnalyses, ...latest]).slice(0, 30);
  const archiveOut = uniqueById([...archived, ...latest.filter((article) => !publishedIds.has(article.id))]);
  const searchIndex = uniqueById([...latestOut, ...archiveOut].filter(publicSearchEligible)).map((article) => ({
    ...article,
    searchText: [
      article.title,
      article.source,
      article.primary_category,
      article.region,
      article.infrastructure_layer,
      article.expertLensFull?.finalArticleBody,
      article.deck,
      ...(article.tags || []),
    ].filter(Boolean).join(' '),
  }));

  await Promise.all([
    appendEditorialCycle(result.cycle),
    writeSignalClusters(result.clusters),
    writeClaimLedger(result.claimLedgers),
    writeJsonFile(LATEST_NEWS_PATH, latestOut),
    writeJsonFile(ARCHIVE_NEWS_PATH, archiveOut),
    writeJsonFile(SEARCH_INDEX_PATH, searchIndex),
  ]);

  return result;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const result = await runAndPersistEditorialCycle();
  console.log(`editorial cycle ${result.cycle.cycle_id}: ${result.cycle.status}`);
  console.log(`published analyses: ${result.publishedAnalyses.length}`);
  console.log(`clusters: ${result.clusters.length}`);
  console.log(`root: ${ROOT}`);
}
