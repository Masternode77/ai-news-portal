import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { qualitySafeBackfill } from './lib/quality-safe-backfill.mjs';
import { runSourceHealthCheck } from './lib/source-health-check.mjs';
import { searchIndexEligible } from './lib/seo-launch-policy.mjs';
import { LAUNCH_GENERATION_VERSION, EDITORIAL_ENGINE_V3_VERSION } from './lib/editorial-article-engine-v3.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LATEST_PATH = path.join(ROOT, 'src/data/latest-news.json');
const ARCHIVE_PATH = path.join(ROOT, 'src/data/archived-news.json');
const SEARCH_PATH = path.join(ROOT, 'src/data/search-index.json');
const TAXONOMY_PATH = path.join(ROOT, 'src/data/taxonomy-pages.json');
const REPORT_PATH = path.join(ROOT, 'docs/final-regeneration-report.md');
const RESCUE_REPORT_PATH = path.join(ROOT, 'docs/launch-content-rescue-report.md');

async function readJson(filePath, fallback = []) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function readGitJson(relativePath, fallback = []) {
  try {
    const output = execFileSync('git', ['show', `HEAD:${relativePath}`], {
      cwd: ROOT,
      maxBuffer: 128 * 1024 * 1024,
      encoding: 'utf8',
    });
    return JSON.parse(output);
  } catch {
    return fallback;
  }
}

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function sourceTextDepth(item = {}) {
  return Math.max(
    String(item.cleaned_source_text || '').length,
    String(item.source_evidence_text || '').length,
    String(item.rawText || '').length,
    String(item.contentText || '').length
  );
}

function sourceRecordScore(item = {}) {
  const launchGenerated = item.public_generation_version === LAUNCH_GENERATION_VERSION
    || item.editorial_engine_version === EDITORIAL_ENGINE_V3_VERSION;
  const sourceLike = Boolean(item.cleaned_source_text || item.source_evidence_text || item.rawText);
  return sourceTextDepth(item)
    + (sourceLike ? 1000 : 0)
    - (launchGenerated ? 10000 : 0);
}

function uniqueById(items = []) {
  const byId = new Map();
  for (const item of items) {
    if (!item?.id) continue;
    const existing = byId.get(item.id);
    if (!existing || sourceRecordScore(item) > sourceRecordScore(existing)) {
      byId.set(item.id, item);
    }
  }
  return [...byId.values()];
}

function compact(value = '', limit = 0) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return limit && text.length > limit ? `${text.slice(0, limit - 1).trim()}...` : text;
}

function compactLines(values = [], limit = 4, textLimit = 240) {
  return (Array.isArray(values) ? values : [])
    .map((value) => compact(value, textLimit))
    .filter(Boolean)
    .slice(0, limit);
}

function compactPresentation(presentation = {}, article = {}) {
  return {
    signal_label: compact(presentation.signal_label || article.public_signal_label || article.public_route, 80),
    title: compact(presentation.title || article.title, 180),
    deck: compact(presentation.deck || article.deck || article.summary || article.snippet, 320),
    why_it_matters: compact(presentation.why_it_matters || article.why_it_matters || article.deck, 320),
    editorial_lens: compact(presentation.editorial_lens || article.editorial_lens, 120),
    source: compact(presentation.source || article.source, 120),
    region: compact(presentation.region || article.region || 'Global', 80),
    reader_impact: compactLines(presentation.reader_impact || article.reader_impact || [], 4, 90),
    view_detail: presentation.view_detail || (article.articlePagePublished === false ? '' : `/news/${article.id}/`),
    read_source: presentation.read_source || article.source_url || article.sourceUrl || article.url || '',
    lane_key: presentation.lane_key || article.public_routing?.laneKey || 'todays-constraint',
  };
}

function compactEvidencePack(evidence = {}) {
  return {
    verified_facts: compactLines(evidence.verified_facts || evidence.facts || [], 8, 280),
    facts: compactLines(evidence.facts || evidence.verified_facts || [], 8, 280),
    source_links: (Array.isArray(evidence.source_links) ? evidence.source_links : []).slice(0, 6).map((link) => ({
      title: compact(link.title || link.text || '', 160),
      url: link.url || '',
    })),
    source_limitations: compact(evidence.source_limitations || evidence.uncertainty?.[0] || '', 280),
    uncertainty: compactLines(evidence.uncertainty || [], 3, 240),
  };
}

function compactClaimLedger(claims = []) {
  return (Array.isArray(claims) ? claims : []).slice(0, 16).map((claim) => ({
    claim: compact(claim.claim || claim.text || '', 260),
    support: compact(claim.support || claim.evidence || '', 220),
    status: compact(claim.status || claim.verification_status || '', 80),
    numeric_value: claim.numeric_value ?? null,
    unit: compact(claim.unit || '', 40),
  }));
}

function compactQualityScores(scores = {}) {
  return Object.fromEntries(
    Object.entries(scores || {})
      .filter(([, value]) => typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean')
      .slice(0, 24)
  );
}

function sourceUrlFor(article = {}) {
  return article.source_url || article.sourceUrl || article.url || article.source_attribution?.url || '';
}

function compactSourceEvidence(article = {}, limit = 12000) {
  const text = compact(
    article.cleaned_source_text
      || article.source_evidence_text
      || article.rawText
      || article.contentText
      || '',
  );
  if (!limit || text.length <= limit) return text;
  const clipped = text.slice(0, limit);
  const lastSentence = Math.max(clipped.lastIndexOf('. '), clipped.lastIndexOf('! '), clipped.lastIndexOf('? '));
  return (lastSentence > 800 ? clipped.slice(0, lastSentence + 1) : clipped).trim();
}

function compactLaunchArticle(article = {}, index = 0) {
  const sourceUrl = sourceUrlFor(article);
  const body = String(article.article_body_markdown || article.expertLensFull?.finalArticleBody || '').trim();
  const deck = compact(article.deck || article.summary || article.snippet || article.public_presentation?.deck, 360);
  const presentation = compactPresentation(article.public_presentation || {}, article);
  return {
    id: article.id,
    slug: article.slug || article.id,
    title: compact(article.title, 220),
    deck,
    summary: deck,
    snippet: deck,
    why_it_matters: compact(article.why_it_matters || presentation.why_it_matters || deck, 360),
    byline: article.byline || 'By Compute Current Editorial Desk',
    source: compact(article.source || article.source_attribution?.name || 'Source', 120),
    sourceUrl,
    url: sourceUrl,
    source_url: sourceUrl,
    source_attribution: {
      name: compact(article.source_attribution?.name || article.source || 'Source', 120),
      url: sourceUrl,
      domain: compact(article.source_attribution?.domain || '', 120),
    },
    publishedAt: article.publishedAt || article.analysisPublishedAt || article.updatedAt || new Date().toISOString(),
    updatedAt: article.updatedAt || new Date().toISOString(),
    analysisPublishedAt: article.analysisPublishedAt || new Date().toISOString(),
    sort_index: index,
    at_a_glance: compactLines(article.at_a_glance || article.expertLensFull?.atAGlance || [], 3, 260),
    article_body_markdown: body,
    what_to_watch: compactLines(article.what_to_watch || article.expertLensFull?.watchMetrics || [], 4, 220),
    bottom_line: compact(article.bottom_line || article.expertLensFull?.bottomLine, 360),
    public_route: article.public_route || article.public_routing?.routing_decision || '',
    public_signal_label: article.public_signal_label || article.public_routing?.public_signal_label || '',
    editorial_lens: article.editorial_lens || article.public_routing?.editorial_lens || '',
    category: article.category || article.primary_category || 'AI Infrastructure',
    primary_category: article.primary_category || article.category || 'AI Infrastructure',
    region: article.region || 'Global',
    tags: (Array.isArray(article.tags) ? article.tags : []).slice(0, 10).map((tag) => compact(tag, 80)).filter(Boolean),
    canonical_url: article.canonical_url || `https://www.computecurrent.com/news/${article.id}/`,
    ai_disclosure: article.ai_disclosure || 'AI-assisted extraction, classification, drafting, and quality gates were used. The linked source remains the authoritative record.',
    public_presentation: presentation,
    public_routing: {
      score: Number(article.public_routing?.score || article.infrastructure_relevance_score || 0),
      visibility: article.public_routing?.visibility || (article.articlePagePublished === false ? 'adjacent' : 'core'),
      laneKey: article.public_routing?.laneKey || presentation.lane_key,
      laneTitle: article.public_routing?.laneTitle || article.public_route || '',
      public_signal_label: article.public_routing?.public_signal_label || article.public_signal_label || '',
      editorial_lens: article.public_routing?.editorial_lens || article.editorial_lens || '',
      story_archetype: article.public_routing?.story_archetype || article.editorial_lens || '',
      routing_decision: article.public_routing?.routing_decision || article.public_route || '',
      blocked_reasons: compactLines(article.public_routing?.blocked_reasons || [], 8, 120),
    },
    expertLensShort: deck,
    expertLens: deck,
    expertLensFull: {
      finalArticleBody: body,
      bottomLine: compact(article.bottom_line || article.expertLensFull?.bottomLine, 360),
      atAGlance: compactLines(article.at_a_glance || article.expertLensFull?.atAGlance || [], 3, 260),
      watchMetrics: compactLines(article.what_to_watch || article.expertLensFull?.watchMetrics || [], 4, 220),
      metaDescription: deck,
      sourceLink: sourceUrl,
    },
    source_count: Number(article.source_count || article.evidence_pack?.source_links?.length || 1),
    source_type: article.source_type || '',
    cleaned_source_text: compactSourceEvidence(article),
    source_evidence_text: compactSourceEvidence(article),
    infrastructure_relevance_score: Number(article.infrastructure_relevance_score || article.public_routing?.score || 0.7),
    public_generation_version: LAUNCH_GENERATION_VERSION,
    generation_version: LAUNCH_GENERATION_VERSION,
    editorial_engine_version: EDITORIAL_ENGINE_V3_VERSION,
    articlePagePublished: article.articlePagePublished !== false,
    homepagePublished: article.homepagePublished !== false,
    archiveOnly: article.archiveOnly === true,
    noindex: article.noindex === true,
    seo_noindex: article.seo_noindex === true,
    signalCardOnly: article.signalCardOnly === true,
    public_status: article.public_status || 'published',
    public_publish_blocked: article.public_publish_blocked === true,
    public_publish_block_reasons: compactLines(article.public_publish_block_reasons || [], 16, 160),
    seo_noindex_reasons: compactLines(article.seo_noindex_reasons || [], 12, 160),
    evidence_pack: compactEvidencePack(article.evidence_pack || {}),
    claim_ledger: compactClaimLedger(article.claim_ledger || []),
    claim_ledger_summary: article.claim_ledger_summary || {},
    extraction_quality_score: article.extraction_quality_score ?? null,
    source_scope_policy: article.source_scope_policy || null,
    routing_decision: article.routing_decision || article.public_route || '',
    quarantine_reason: article.quarantine_reason || '',
    debug_reasoning: article.debug_reasoning ? {
      pipeline: compactLines(article.debug_reasoning.pipeline || [], 16, 120),
      route_reason: compact(article.debug_reasoning.route_reason || '', 320),
    } : null,
    quality_scores: compactQualityScores(article.quality_scores || {}),
  };
}

function compactArchiveOnlyRecord(article = {}) {
  return {
    id: article.id,
    slug: article.slug || article.id,
    title: compact(article.title, 220),
    summary: compact(article.deck || article.summary || article.snippet, 360),
    source: compact(article.source || article.source_attribution?.name || 'Source', 120),
    sourceUrl: sourceUrlFor(article),
    url: sourceUrlFor(article),
    source_type: article.source_type || '',
    source_count: Number(article.source_count || article.evidence_pack?.source_links?.length || 1),
    primary_category: article.primary_category || article.category || 'AI Infrastructure',
    category: article.category || article.primary_category || 'AI Infrastructure',
    region: article.region || 'Global',
    tags: (Array.isArray(article.tags) ? article.tags : []).slice(0, 10).map((tag) => compact(tag, 80)).filter(Boolean),
    publishedAt: article.publishedAt || article.analysisPublishedAt || article.updatedAt || '',
    updatedAt: article.updatedAt || '',
    cleaned_source_text: compactSourceEvidence(article),
    source_evidence_text: compactSourceEvidence(article),
    public_generation_version: article.public_generation_version || article.generation_version || '',
    generation_version: article.generation_version || article.public_generation_version || '',
    editorial_engine_version: article.editorial_engine_version || '',
    homepagePublished: false,
    articlePagePublished: false,
    archiveOnly: true,
    noindex: true,
    seo_noindex: true,
    public_status: article.public_status === 'quarantined' ? 'quarantined' : 'archive_only_noindex',
    public_publish_block_reasons: compactLines(article.public_publish_block_reasons || [], 16, 160),
    seo_noindex_reasons: compactLines(article.seo_noindex_reasons || [], 12, 160),
  };
}

function quarantineArchiveRecord(article = {}) {
  if (article.public_generation_version === LAUNCH_GENERATION_VERSION) return compactArchiveOnlyRecord(article);
  return compactArchiveOnlyRecord({
    ...article,
    public_status: article.public_status === 'quarantined' ? 'quarantined' : 'archive_only_noindex',
    public_publish_block_reasons: [
      ...(article.public_publish_block_reasons || []),
      article.public_generation_version === 'autonomous_editorial_desk_v1'
        || article.generation_version === 'autonomous_editorial_desk_v1'
        ? 'stale_autonomous_blog_writer_v1_public_article'
        : 'not_selected_for_launch_surface',
    ],
  });
}

function archivePages(items = []) {
  const publicItems = items.filter((item) => item.homepagePublished !== false && item.public_status !== 'quarantined');
  const pageSize = 24;
  const pages = [];
  for (let index = 0; index < publicItems.length; index += pageSize) {
    pages.push({
      page: pages.length + 1,
      total: publicItems.length,
      items: publicItems.slice(index, index + pageSize),
    });
  }
  return pages.length ? pages : [{ page: 1, total: 0, items: [] }];
}

function groupedPages(items = [], keyFn, slugFn = keyFn) {
  const groups = new Map();
  for (const item of items) {
    const key = keyFn(item);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  return [...groups.entries()].map(([title, group]) => ({
    slug: slugFn(title),
    title,
    items: group.slice(0, 24),
    total: group.length,
  }));
}

function slugify(value = '') {
  return String(value).toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function sourceHealthSummary(health = []) {
  return {
    total: health.length,
    clean: health.filter((record) => Number(record.quality_score || 0) >= 0.75).length,
    active_feed: health.filter((record) => record.status === 'active_feed').length,
    active_sitemap: health.filter((record) => record.status === 'active_sitemap').length,
    inactive: health.filter((record) => ['blocked', 'paywalled', 'extraction_failed'].includes(record.status)).length,
  };
}

function routeCounts(items = []) {
  const counts = new Map();
  for (const item of items) counts.set(item.public_route || 'unknown', (counts.get(item.public_route || 'unknown') || 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

export async function regenerateLaunchSurfaceV1(options = {}) {
  const beforeLatest = await readJson(LATEST_PATH, []);
  const beforeArchive = await readJson(ARCHIVE_PATH, []);
  const beforeSearch = await readJson(SEARCH_PATH, []);
  const baselineLatest = readGitJson('src/data/latest-news.json', []);
  const baselineArchive = readGitJson('src/data/archived-news.json', []);
  const sourceHealth = await runSourceHealthCheck({
    skipNetwork: process.env.SOURCE_HEALTH_SKIP_NETWORK === '1' || options.skipNetwork === true,
    timeoutMs: 6000,
  });
  const all = uniqueById([...beforeLatest, ...beforeArchive, ...baselineLatest, ...baselineArchive]);
  const backfill = qualitySafeBackfill(all, {
    days: 45,
    targetVisible: 20,
    targetLocal: 12,
    targetFull: 6,
  });
  const launchLatest = backfill.visible.map((article, index) => compactLaunchArticle({
    ...article,
    sort_index: index,
    updatedAt: new Date().toISOString(),
    analysisPublishedAt: new Date().toISOString(),
    public_generation_version: LAUNCH_GENERATION_VERSION,
    editorial_engine_version: EDITORIAL_ENGINE_V3_VERSION,
  }, index));
  const latestIds = new Set(launchLatest.map((item) => item.id));
  const generatedById = new Map(launchLatest.map((item) => [item.id, item]));
  const archive = all
    .filter((item) => !latestIds.has(item.id))
    .map((item) => quarantineArchiveRecord(generatedById.get(item.id) || item));
  const searchIndex = launchLatest.filter(searchIndexEligible);
  const taxonomy = {
    generatedAt: new Date().toISOString(),
    categories: groupedPages(launchLatest, (item) => item.primary_category || item.category || 'AI Infrastructure', slugify),
    companies: groupedPages(launchLatest, (item) => (item.tags || [])[0] || item.source || '', slugify),
    regions: groupedPages(launchLatest, (item) => item.region || 'Global', slugify),
    archive: archivePages(launchLatest),
  };

  await writeJson(LATEST_PATH, launchLatest);
  await writeJson(ARCHIVE_PATH, archive);
  await writeJson(SEARCH_PATH, searchIndex);
  await writeJson(TAXONOMY_PATH, taxonomy);

  const beforeHomepage = beforeLatest.filter((item) => item.homepagePublished !== false && item.archiveOnly !== true).length;
  const beforeSearchCount = Array.isArray(beforeSearch) ? beforeSearch.length : Object.keys(beforeSearch || {}).length;
  const sourceSummary = sourceHealthSummary(sourceHealth.healthRecords);
  const topFailures = new Map();
  for (const failure of backfill.failures) {
    for (const reason of failure.reasons || ['unknown']) topFailures.set(reason, (topFailures.get(reason) || 0) + 1);
  }
  for (const rejected of backfill.pool.rejected) {
    topFailures.set(rejected.reason, (topFailures.get(rejected.reason) || 0) + 1);
  }

  const reportLines = [
    '# Final Regeneration Report',
    '',
    `Generated at: ${new Date().toISOString()}`,
    `public_generation_version: ${LAUNCH_GENERATION_VERSION}`,
    `editorial_engine_version: ${EDITORIAL_ENGINE_V3_VERSION}`,
    '',
    `- scanned items: ${all.length}`,
    `- clean candidate items: ${backfill.pool.candidates.length}`,
    `- rejected candidate items: ${backfill.pool.rejected.length}`,
    `- visible homepage items before/after: ${beforeHomepage} -> ${launchLatest.length}`,
    `- search index count before/after: ${beforeSearchCount} -> ${searchIndex.length}`,
    `- sitemap count before/after: local build will derive from ${searchIndex.length} indexable articles`,
    `- RSS count before/after: local build will derive from ${searchIndex.length} indexable articles`,
    `- full local articles generated: ${launchLatest.filter((item) => /Core Longform Blog|Standard Blog/i.test(item.public_route || '')).length}`,
    `- standard blogs generated: ${launchLatest.filter((item) => item.public_route === 'Standard Blog').length}`,
    `- expert/platform briefs generated: ${launchLatest.filter((item) => /Expert Brief|Cloud Product Read|Enterprise Platform Note/i.test(item.public_route || '')).length}`,
    `- short signals generated: ${launchLatest.filter((item) => item.public_route === 'Short Signal').length}`,
    `- source cards retained: ${launchLatest.filter((item) => item.public_route === 'Source Card').length}`,
    `- quarantined/archive-only records: ${archive.length}`,
    `- source health summary: ${JSON.stringify(sourceSummary)}`,
    '',
    '## Route mix',
    '',
    ...routeCounts(launchLatest).map(([route, count]) => `- ${route}: ${count}`),
    '',
    '## Top quarantine/rejection reasons',
    '',
    ...[...topFailures.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20).map(([reason, count]) => `- ${reason}: ${count}`),
    '',
    '## Launch target status',
    '',
    `- homepage visible target met: ${launchLatest.length >= 20}`,
    `- local article target met: ${launchLatest.filter((item) => item.articlePagePublished !== false && item.noindex !== true).length >= 12}`,
    `- full article target met: ${launchLatest.filter((item) => /Core Longform Blog|Standard Blog/i.test(item.public_route || '')).length >= 6}`,
    `- source-only ratio target met: ${launchLatest.filter((item) => item.public_route === 'Source Card').length / Math.max(launchLatest.length, 1) <= 0.3}`,
  ];
  await fs.writeFile(REPORT_PATH, `${reportLines.join('\n')}\n`, 'utf8');
  await fs.writeFile(RESCUE_REPORT_PATH, `${reportLines.join('\n')}\n`, 'utf8');

  return {
    latest: launchLatest,
    archive,
    searchIndex,
    backfill,
    sourceHealth,
    reportPath: REPORT_PATH,
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const result = await regenerateLaunchSurfaceV1();
  console.log(`launch surface regenerated: ${result.latest.length} visible, ${result.searchIndex.length} indexed`);
  console.log(`report: ${path.relative(ROOT, result.reportPath)}`);
}
