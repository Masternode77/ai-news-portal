// Refreshes the industry radar (headline-and-link lane) from the registry's
// link-only publishers. A failed or thin refresh keeps the previous list, so
// a network problem never blanks the public section.
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { loadSourceRegistry } from './lib/source-registry.mjs';
import { INDUSTRY_HEADLINES_PATH, refreshIndustryHeadlines } from './lib/industry-headlines.mjs';
import { PIPELINE_OFFLINE } from './lib/constants.mjs';

const MIN_ITEMS_TO_REPLACE = 8;

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
  const counts = result.items.reduce((acc, item) => ({ ...acc, [item.language]: (acc[item.language] || 0) + 1 }), {});
  console.log(`[headlines] feeds attempted=${result.feeds.attempted} ok=${result.feeds.succeeded} failed=${result.feeds.failed.length} items=${result.items.length} ${JSON.stringify(counts)}`);
  if (result.feeds.failed.length) console.log(`[headlines] failed feeds: ${result.feeds.failed.join(', ')}`);
  if (result.items.length < MIN_ITEMS_TO_REPLACE) {
    const previous = await readPrevious(path);
    console.warn(`[headlines] only ${result.items.length} headlines; keeping the previous list (${previous?.items?.length || 0} items)`);
    return { written: false, reason: 'too_few_items', result };
  }
  await fs.writeFile(path, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  return { written: true, result };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  updateIndustryHeadlines()
    .then((outcome) => {
      if (!outcome.written) console.log(`[headlines] list unchanged (${outcome.reason})`);
    })
    .catch((error) => {
      // Never fail the scheduled run over the radar; the previous list stays.
      console.warn(`[headlines] refresh failed: ${error.message}`);
    });
}
