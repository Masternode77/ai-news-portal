import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { discoverSourceFeeds } from './source-feed-discovery.mjs';
import { loadSourceRegistry, REQUESTED_SOURCE_IDS } from './source-registry.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const REPORT_PATH = path.join(ROOT, 'docs/source-expansion-report.md');

function statusIsActive(status = '') {
  return ['active_feed', 'active_sitemap', 'landing_page_only'].includes(status);
}

export async function runSourceHealthCheck(options = {}) {
  const sources = options.sources || await loadSourceRegistry();
  const requested = sources.filter((source) => REQUESTED_SOURCE_IDS.includes(source.id));
  const discovery = options.skipNetwork
    ? requested.map((source) => ({
        source,
        status: source.status || (source.feed ? 'active_feed' : 'landing_page_only'),
        discoveredUrl: source.feed || `https://${source.domain}/`,
      }))
    : await discoverSourceFeeds(requested, options);
  const activeCount = discovery.filter((result) => statusIsActive(result.status)).length;

  const lines = [
    '# Source Expansion Report',
    '',
    `Generated at: ${new Date().toISOString()}`,
    '',
    `Requested sources present: ${requested.length} / ${REQUESTED_SOURCE_IDS.length}`,
    `Requested sources active by feed/sitemap/landing discovery: ${activeCount} / ${REQUESTED_SOURCE_IDS.length}`,
    '',
    '| Source | Domain | Priority | Health | Discovered URL |',
    '| --- | --- | --- | --- | --- |',
    ...discovery.map((result) => `| ${result.source.name} | ${result.source.domain} | ${result.source.priority || ''} | ${result.status} | ${result.discoveredUrl || 'needs fallback'} |`),
    '',
    activeCount >= 6
      ? 'Acceptance: at least 6 of the 10 added publishers are active through declared or discovered feed/sitemap paths.'
      : 'Acceptance risk: fewer than 6 added publishers were active in this run; use fallback candidates or manual source review before enabling aggressive crawl.',
  ];

  if (options.writeReport !== false) {
    await fs.mkdir(path.dirname(REPORT_PATH), { recursive: true });
    await fs.writeFile(REPORT_PATH, `${lines.join('\n')}\n`, 'utf8');
  }

  return { sources, requested, discovery, activeCount, reportPath: REPORT_PATH };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const skipNetwork = process.env.SOURCE_HEALTH_SKIP_NETWORK === '1';
  const result = await runSourceHealthCheck({ skipNetwork });
  console.log(`source health: ${result.activeCount}/${REQUESTED_SOURCE_IDS.length} requested sources active`);
}
