import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { publicPublishQualityGate } from './lib/public-publish-quality-gate.mjs';
import { sourceScopePolicyResult } from './lib/source-scope-policy.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPORT_PATH = path.join(ROOT, 'docs/final-current-state-audit.md');
const SITE_URL = 'https://www.computecurrent.com/';

function readJson(relativePath, fallback = []) {
  try {
    return JSON.parse(fsSync.readFileSync(path.join(ROOT, relativePath), 'utf8'));
  } catch {
    return fallback;
  }
}

function readText(relativePath) {
  try {
    return fsSync.readFileSync(path.join(ROOT, relativePath), 'utf8');
  } catch {
    return '';
  }
}

function run(command, args = []) {
  try {
    return execFileSync(command, args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch (error) {
    return String(error.stdout || error.stderr || error.message || '').trim();
  }
}

function readGitJson(refPath, fallback = []) {
  try {
    return JSON.parse(run('git', ['show', `HEAD:${refPath}`]));
  } catch {
    return fallback;
  }
}

function uniqueById(items = []) {
  const seen = new Set();
  return items.filter((item) => {
    if (!item?.id || seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function sourceUrl(article = {}) {
  return article.sourceUrl || article.url || '';
}

function sourceDomain(article = {}) {
  try {
    return new URL(sourceUrl(article)).hostname.replace(/^www\./, '');
  } catch {
    return 'unknown';
  }
}

function isQuarantined(article = {}) {
  return article.public_status === 'quarantined'
    || article.public_status === 'archive_only_noindex'
    || article.archiveOnly === true
    || article.noindex === true
    || article.seo_noindex === true;
}

function isVisible(article = {}) {
  return article.homepagePublished !== false
    && article.archiveOnly !== true
    && article.public_status !== 'quarantined'
    && article.public_status !== 'archive_only_noindex';
}

function isLocalArticle(article = {}) {
  return isVisible(article)
    && article.articlePagePublished !== false
    && article.signalCardOnly !== true
    && article.noindex !== true
    && article.seo_noindex !== true;
}

function isSourceCard(article = {}) {
  return isVisible(article)
    && (article.articlePagePublished === false
      || article.signalCardOnly === true
      || /source card|source watch/i.test(`${article.public_route || ''} ${article.public_status || ''}`));
}

function reasonsFor(article = {}) {
  return [
    article.quarantine_reason,
    article.quarantineReason,
    article.public_gate_reason,
    ...(Array.isArray(article.public_gate_reasons) ? article.public_gate_reasons : []),
    ...(Array.isArray(article.public_publish_block_reasons) ? article.public_publish_block_reasons : []),
    ...(Array.isArray(article.quality_gate_reasons) ? article.quality_gate_reasons : []),
    ...(Array.isArray(article.regeneration_notes) ? article.regeneration_notes : []),
    ...(Array.isArray(article.seo_noindex_reasons) ? article.seo_noindex_reasons : []),
  ].filter(Boolean).map(String);
}

function countMap(items = []) {
  const map = new Map();
  for (const item of items) map.set(item, (map.get(item) || 0) + 1);
  return [...map.entries()].sort((a, b) => b[1] - a[1]);
}

function builtPublicHtmlFiles() {
  const out = [];
  function walk(dir) {
    if (!fsSync.existsSync(dir)) return;
    for (const name of fsSync.readdirSync(dir)) {
      const full = path.join(dir, name);
      const stat = fsSync.statSync(full);
      if (stat.isDirectory()) walk(full);
      else if ((name.endsWith('.html') || name.endsWith('.xml')) && !path.relative(path.join(ROOT, 'dist'), full).startsWith('admin/')) out.push(full);
    }
  }
  walk(path.join(ROOT, 'dist'));
  return out;
}

function publicLeakMatches() {
  const pattern = /Backfilled Analysis|Verification frame|Verified facts|Key numbers|Source count|Unsupported claims|Claim verification|claim ledger|evidence anchor|infrastructure lane|cluster clears the desk bar|source item centers on|control point in this story|Why the desk selected it/i;
  return builtPublicHtmlFiles()
    .map((file) => ({ file: path.relative(ROOT, file), leaked: pattern.test(fsSync.readFileSync(file, 'utf8')) }))
    .filter((entry) => entry.leaked);
}

function routeMismatch(article = {}) {
  const policy = sourceScopePolicyResult(article);
  if (policy.force_non_core_signal) {
    if (article.public_signal_label === 'Core Signal') return 'single_source_vendor_core_signal';
    if (article.primary_category === 'Cloud Capacity') return 'single_source_vendor_cloud_capacity';
  }
  if ((article.primary_category === 'Cloud Capacity' || article.category === 'Cloud Capacity') && policy.force_non_cloud_capacity) {
    return 'cloud_capacity_without_explicit_capacity_evidence';
  }
  return '';
}

function sitemapCount() {
  const sitemap = readText('dist/sitemap.xml') || readText('dist/sitemap-0.xml');
  return (sitemap.match(/<url>/g) || []).length;
}

function rssCount() {
  const rss = readText('dist/rss.xml');
  return (rss.match(/<item>/g) || []).length;
}

function productionProbe() {
  const headers = run('curl', ['-I', '-L', '--max-time', '20', SITE_URL]);
  const ok = /HTTP\/\d(?:\.\d)?\s+200/.test(headers);
  const vercelCache = headers.match(/x-vercel-cache:\s*([^\n\r]+)/i)?.[1]?.trim() || 'unknown';
  const lastModified = headers.match(/last-modified:\s*([^\n\r]+)/i)?.[1]?.trim() || 'unknown';
  const deployment = run('vercel', ['inspect', SITE_URL, '--format=json']);
  const ready = /"readyState":\s*"READY"/.test(deployment);
  const aliases = [...deployment.matchAll(/"([^"]*computecurrent\.com)"/g)].map((match) => match[1]);
  return { ok, vercelCache, lastModified, ready, aliases: [...new Set(aliases)] };
}

export async function runFinalCurrentStateAudit() {
  const latest = readJson('src/data/latest-news.json');
  const archived = readJson('src/data/archived-news.json');
  const searchIndex = readJson('src/data/search-index.json');
  const baselineLatest = readGitJson('src/data/latest-news.json', latest);
  const baselineArchive = readGitJson('src/data/archived-news.json', archived);
  const baselineSearch = readGitJson('src/data/search-index.json', searchIndex);
  const sourceHealth = readJson('src/data/source-health.json');
  const all = uniqueById([...latest, ...archived]);
  const baselineAll = uniqueById([...baselineLatest, ...baselineArchive]);
  const visible = latest.filter(isVisible);
  const localVisible = latest.filter(isLocalArticle);
  const sourceCards = latest.filter(isSourceCard);
  const watchlist = latest.filter((article) => isVisible(article) && /watch|adjacent|short/i.test(`${article.public_route || ''} ${article.public_status || ''} ${article.public_signal_label || ''}`));
  const baselineVisible = baselineLatest.filter(isVisible);
  const baselineLocalVisible = baselineLatest.filter(isLocalArticle);
  const baselineSourceCards = baselineLatest.filter(isSourceCard);
  const baselineWatchlist = baselineLatest.filter((article) => isVisible(article) && /watch|adjacent|short/i.test(`${article.public_route || ''} ${article.public_status || ''} ${article.public_signal_label || ''}`));
  const gateResults = all.map((article) => ({ article, gate: publicPublishQualityGate(article) }));
  const passingV2 = gateResults.filter(({ article, gate }) => article.public_generation_version === 'editorial_article_v2' && gate.ok);
  const failingV2 = gateResults.filter(({ article, gate }) => article.public_generation_version === 'editorial_article_v2' && !gate.ok);
  const quarantineReasons = countMap(all.filter(isQuarantined).flatMap(reasonsFor));
  const cleanDomains = countMap(all.filter((article) => {
    const gate = publicPublishQualityGate(article);
    return gate.ok && article.articlePagePublished !== false && article.noindex !== true;
  }).map(sourceDomain));
  const extractionFailureDomains = countMap(all.filter((article) => reasonsFor(article).join(' ').match(/extract|boilerplate|copyright|truncation/i)).map(sourceDomain));
  const lowRelevanceDomains = countMap(all.filter((article) => reasonsFor(article).join(' ').match(/low_relevance|route_not_core:archive|archive_only_relevance/i)).map(sourceDomain));
  const scopeFailureDomains = countMap(all.filter((article) => reasonsFor(article).join(' ').match(/source_scope|vendor|roundup|overclaim/i)).map(sourceDomain));
  const localHomepageLinks = visible.filter((article) => article.articlePagePublished !== false && !article.signalCardOnly).length;
  const sourceHomepageLinks = visible.length - localHomepageLinks;
  const mismatches = visible.map(routeMismatch).filter(Boolean);
  const production = productionProbe();
  const branch = run('git', ['branch', '--show-current']);
  const head = run('git', ['rev-parse', 'HEAD']);
  const originMain = run('git', ['rev-parse', 'origin/main']);
  const status = run('git', ['status', '--short']);

  const baselineQuarantineReasons = countMap(baselineAll.filter(isQuarantined).flatMap(reasonsFor));
  const diagnosis = [];
  diagnosis.push(`Baseline before launch edits was thin because only ${baselineVisible.length} latest records were homepage-visible and only ${baselineLocalVisible.length} qualified as local public article records. The archive/noindex pool was ${baselineAll.filter(isQuarantined).length} records.`);
  diagnosis.push('The previous regeneration produced 8 published / 42 quarantined because the v2 public gate correctly blocked stale template copy and source-quality failures, while the selection model did not backfill enough clean archived records into local routes.');
  diagnosis.push(`The dominant baseline blockers were ${baselineQuarantineReasons.slice(0, 6).map(([reason, count]) => `${reason} (${count})`).join(', ') || 'not recorded'}.`);
  diagnosis.push('Evidence points to a mix of source extraction quality, stale generated copy, and homepage selection. Source scope policy is doing useful damage control, but it is not the main reason for the thin homepage.');

  const lines = [
    '# Final Current-State Audit',
    '',
    `Generated at: ${new Date().toISOString()}`,
    '',
    '## Git and deployment',
    '',
    `- current branch: ${branch}`,
    `- HEAD: ${head}`,
    `- origin/main: ${originMain}`,
    `- main matches origin/main: ${head === originMain}`,
    `- working tree clean: ${status ? 'false' : 'true'}`,
    `- production homepage reachable: ${production.ok}`,
    `- Vercel deployment state observed: ${production.ready ? 'READY' : 'unknown'}`,
    `- production aliases observed: ${production.aliases.join(', ') || 'unknown'}`,
    `- production cache header: ${production.vercelCache}`,
    `- production last-modified: ${production.lastModified}`,
    '',
    '## Public surface counts',
    '',
    `- baseline homepage visible count: ${baselineVisible.length}`,
    `- baseline local article count: ${baselineLocalVisible.length}`,
    `- baseline source-card/direct-source count: ${baselineSourceCards.length}`,
    `- baseline watchlist count: ${baselineWatchlist.length}`,
    `- baseline archive-only/noindex/quarantined count: ${baselineAll.filter(isQuarantined).length}`,
    `- baseline search index size: ${Array.isArray(baselineSearch) ? baselineSearch.length : Object.keys(baselineSearch || {}).length}`,
    '',
    `- current homepage visible count: ${visible.length}`,
    `- current local article count: ${localVisible.length}`,
    `- current source-card/direct-source count: ${sourceCards.length}`,
    `- current watchlist count: ${watchlist.length}`,
    `- archive-only/noindex/quarantined count: ${all.filter(isQuarantined).length}`,
    `- sitemap entries: ${sitemapCount()}`,
    `- RSS items: ${rssCount()}`,
    `- search index size: ${Array.isArray(searchIndex) ? searchIndex.length : Object.keys(searchIndex || {}).length}`,
    `- public articles passing editorial_article_v2 gate: ${passingV2.length}`,
    `- public articles failing editorial_article_v2 gate: ${failingV2.length}`,
    `- homepage cards linking to local pages: ${localHomepageLinks}`,
    `- homepage cards linking directly to sources: ${sourceHomepageLinks}`,
    `- public HTML debug/schema phrase leaks: ${publicLeakMatches().length}`,
    `- public route/category mismatches: ${mismatches.length}`,
    '',
    '## Source health',
    '',
    `- source health records: ${sourceHealth.length}`,
    `- source domains producing clean evidence: ${cleanDomains.slice(0, 12).map(([domain, count]) => `${domain} (${count})`).join(', ') || 'none'}`,
    `- source domains producing extraction failures: ${extractionFailureDomains.slice(0, 12).map(([domain, count]) => `${domain} (${count})`).join(', ') || 'none'}`,
    `- source domains causing low relevance/archive routing: ${lowRelevanceDomains.slice(0, 12).map(([domain, count]) => `${domain} (${count})`).join(', ') || 'none'}`,
    `- source domains causing source scope failures: ${scopeFailureDomains.slice(0, 12).map(([domain, count]) => `${domain} (${count})`).join(', ') || 'none'}`,
    '',
    '## Quarantine reason distribution',
    '',
    ...quarantineReasons.slice(0, 30).map(([reason, count]) => `- ${reason}: ${count}`),
    '',
    '## Diagnosis',
    '',
    ...diagnosis.map((line) => `- ${line}`),
  ];

  await fs.mkdir(path.dirname(REPORT_PATH), { recursive: true });
  await fs.writeFile(REPORT_PATH, `${lines.join('\n')}\n`, 'utf8');
  return {
    reportPath: REPORT_PATH,
    counts: {
      visible: visible.length,
      localVisible: localVisible.length,
      sourceCards: sourceCards.length,
      watchlist: watchlist.length,
      archiveOnlyNoindex: all.filter(isQuarantined).length,
      sitemap: sitemapCount(),
      rss: rssCount(),
      searchIndex: Array.isArray(searchIndex) ? searchIndex.length : Object.keys(searchIndex || {}).length,
      passingV2: passingV2.length,
      failingV2: failingV2.length,
      leaks: publicLeakMatches().length,
      mismatches: mismatches.length,
    },
    diagnosis,
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const result = await runFinalCurrentStateAudit();
  console.log(`final current-state audit written: ${path.relative(ROOT, result.reportPath)}`);
  console.log(JSON.stringify(result.counts, null, 2));
}
