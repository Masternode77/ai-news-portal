// Refreshes the industry radar (headline-and-link lane) from the registry's
// link-only publishers. A language whose refresh comes back thin keeps its
// previous, still-current headlines, so a network problem never blanks a
// public section.
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { loadSourceRegistry } from './lib/source-registry.mjs';
import { INDUSTRY_HEADLINES_PATH, mergeHeadlineSnapshots, refreshIndustryHeadlines } from './lib/industry-headlines.mjs';
import { PIPELINE_OFFLINE } from './lib/constants.mjs';

async function readPrevious(path) {
  try {
    return JSON.parse(await fs.readFile(path, 'utf8'));
  } catch {
    return null;
  }
}

export async function updateIndustryHeadlines({ now = new Date(), sources, fetchFeed, path = INDUSTRY_HEADLINES_PATH, offline = PIPELINE_OFFLINE } = {}) {
  if (offline) {
    console.log('[headlines] offline mode; keeping the existing list');
    return { written: false, reason: 'offline' };
  }
  const registry = sources || await loadSourceRegistry();
  const result = await refreshIndustryHeadlines({ sources: registry, now, ...(fetchFeed ? { fetchFeed } : {}) });
  const previous = await readPrevious(path);
  const snapshot = mergeHeadlineSnapshots(result, previous, { now });
  const counts = snapshot.items.reduce((acc, item) => ({ ...acc, [item.language]: (acc[item.language] || 0) + 1 }), {});
  console.log(`[headlines] feeds attempted=${result.feeds.attempted} ok=${result.feeds.succeeded} failed=${result.feeds.failed.length} fresh=${result.items.length} published=${snapshot.items.length} ${JSON.stringify(counts)}`);
  if (result.feeds.failed.length) console.log(`[headlines] failed feeds: ${result.feeds.failed.join(', ')}`);
  if (snapshot.carriedOver) console.log(`[headlines] kept previous headlines for thin lanes: ${JSON.stringify(snapshot.carriedOver)}`);
  await fs.writeFile(path, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
  return { written: true, result, snapshot };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  updateIndustryHeadlines()
    .catch((error) => {
      // Never fail the scheduled run over the radar; the previous list stays.
      console.warn(`[headlines] refresh failed: ${error.message}`);
    });
}
