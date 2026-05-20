import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { discoverSourceFeeds } from './source-feed-discovery.mjs';
import { loadSourceRegistry, REQUESTED_SOURCE_IDS, sourceRegistrySummary } from './source-registry.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const REPORT_PATH = path.join(ROOT, 'docs/final-source-expansion-report.md');
const LEGACY_REPORT_PATH = path.join(ROOT, 'docs/source-expansion-report.md');
const SOURCE_HEALTH_DATA_PATH = path.join(ROOT, 'src/data/source-health.json');

function statusIsActive(status = '') {
  return ['active_feed', 'active_sitemap', 'landing_page_only'].includes(status);
}

function qualityScore(result = {}) {
  if (result.status === 'active_feed') return 0.92;
  if (result.status === 'active_sitemap') return 0.78;
  if (result.status === 'landing_page_only') return 0.45;
  if (result.status === 'paywalled') return 0.32;
  if (result.status === 'blocked') return 0.2;
  return 0.25;
}

function healthRecord(result = {}) {
  const source = result.source || {};
  return {
    source_id: source.id,
    source_name: source.name,
    domain: source.domain,
    active_feed: result.status === 'active_feed' ? result.discoveredUrl || source.feed || '' : '',
    active_sitemap: result.status === 'active_sitemap' ? result.discoveredUrl || source.sitemap || '' : '',
    landing_page_only: result.status === 'landing_page_only',
    blocked: result.status === 'blocked',
    paywalled: result.status === 'paywalled',
    extraction_failed: result.status === 'extraction_failed',
    adapter_required: !source.feed && result.status !== 'active_feed',
    quality_score: qualityScore(result),
    status: result.status,
    discovered_url: result.discoveredUrl || '',
    http_status: result.httpStatus || null,
    reason: result.reason || '',
  };
}

export async function runSourceHealthCheck(options = {}) {
  const sources = options.sources || await loadSourceRegistry();
  const requested = sources.filter((source) => REQUESTED_SOURCE_IDS.includes(source.id));
  const discovery = options.skipNetwork
    ? requested.map((source) => ({
        source,
        status: source.status || (source.feed ? 'active_feed' : source.sitemap ? 'active_sitemap' : 'landing_page_only'),
        discoveredUrl: source.feed || source.sitemap || `https://${source.domain}/`,
      }))
    : await discoverSourceFeeds(requested, options);
  const activeCount = discovery.filter((result) => statusIsActive(result.status)).length;
  const healthRecords = discovery.map(healthRecord);
  const cleanEvidenceSources = healthRecords.filter((record) => record.quality_score >= 0.75).length;
  const summary = sourceRegistrySummary(sources);

  const lines = [
    '# Source Expansion Report',
    '',
    `Generated at: ${new Date().toISOString()}`,
    '',
    `Total registry entries: ${summary.total_sources}`,
    `Requested launch sources present: ${requested.length} / ${REQUESTED_SOURCE_IDS.length}`,
    `Requested launch sources active by feed/sitemap/landing discovery: ${activeCount} / ${REQUESTED_SOURCE_IDS.length}`,
    `Sources with clean feed/sitemap evidence path: ${cleanEvidenceSources}`,
    `Active feed declarations in registry: ${summary.active_feed_sources}`,
    `Active sitemap declarations in registry: ${summary.active_sitemap_sources}`,
    `Landing-page/manual sources: ${summary.landing_page_only_sources}`,
    '',
    '| Source | Domain | Priority | Health | Quality | Discovered URL | Notes |',
    '| --- | --- | --- | --- | ---: | --- | --- |',
    ...healthRecords.map((record) => {
      const source = discovery.find((item) => item.source.id === record.source_id)?.source || {};
      const notes = record.blocked
        ? 'blocked'
        : record.extraction_failed
          ? record.reason || 'extraction failed'
          : record.adapter_required
            ? 'adapter required'
            : '';
      return `| ${record.source_name} | ${record.domain} | ${source.priority || ''} | ${record.status} | ${record.quality_score} | ${record.discovered_url || 'needs fallback'} | ${notes} |`;
    }),
    '',
    activeCount >= 12 && cleanEvidenceSources >= 8
      ? 'Acceptance: launch source registry has at least 12 active feed/sitemap/landing paths and at least 8 clean evidence-producing sources.'
      : 'Acceptance risk: source pool is still too thin; use manual review or additional adapters before increasing public publication targets.',
  ];

  if (options.writeReport !== false) {
    await fs.mkdir(path.dirname(REPORT_PATH), { recursive: true });
    await fs.writeFile(REPORT_PATH, `${lines.join('\n')}\n`, 'utf8');
    await fs.writeFile(LEGACY_REPORT_PATH, `${lines.join('\n')}\n`, 'utf8');
    await fs.writeFile(SOURCE_HEALTH_DATA_PATH, `${JSON.stringify(healthRecords, null, 2)}\n`, 'utf8');
  }

  return { sources, requested, discovery, healthRecords, activeCount, cleanEvidenceSources, reportPath: REPORT_PATH };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const skipNetwork = process.env.SOURCE_HEALTH_SKIP_NETWORK === '1';
  const result = await runSourceHealthCheck({ skipNetwork });
  console.log(`source health: ${result.activeCount}/${REQUESTED_SOURCE_IDS.length} requested sources active`);
}
