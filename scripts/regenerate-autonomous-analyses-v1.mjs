import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runGlobalSourceScan } from './lib/global-source-scan.mjs';
import { clusterSignalItems } from './lib/signal-clusterer.mjs';
import { scoreSignalClusters } from './lib/signal-scoring-engine.mjs';
import { selectEditorialSignals } from './lib/editorial-selection-engine.mjs';
import { writeAutonomousBlogArticle } from './lib/autonomous-blog-writer-v1.mjs';
import { writeSignalClusters } from './lib/signal-cluster-store.mjs';
import { writeClaimLedger } from './lib/claim-ledger.mjs';
import { articleDetailQualityResult } from './lib/article-detail-quality-gate.mjs';
import { readEditorialCycles } from './lib/editorial-cycle-store.mjs';
import { readJsonFile, writeJsonFile } from './lib/state-store.mjs';
import { LATEST_NEWS_PATH, ARCHIVE_NEWS_PATH, SEARCH_INDEX_PATH } from './lib/constants.mjs';
import { AUTONOMOUS_VERSION } from './lib/autonomous-desk-utils.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPORT_PATH = path.join(ROOT, 'docs/autonomous-editorial-desk-migration-report.md');

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

function archiveOld(article = {}, currentIds = new Set()) {
  if (currentIds.has(article.id)) return null;
  return {
    ...article,
    homepagePublished: false,
    articlePagePublished: false,
    archiveOnly: true,
    noindex: true,
    seo_noindex: true,
    public_status: 'archive_only_noindex',
    stale_generation: true,
    seo_noindex_reasons: [...new Set([...(article.seo_noindex_reasons || []), article.generation_version === AUTONOMOUS_VERSION ? 'stale_autonomous_editorial_desk_batch' : 'pre_autonomous_editorial_desk'])],
  };
}

function searchText(article = {}) {
  return [
    article.title,
    article.source,
    article.primary_category,
    article.region,
    article.infrastructure_layer,
    article.deck,
    article.why_it_matters,
    article.expertLensFull?.finalArticleBody,
    ...(article.tags || []),
  ].filter(Boolean).join(' ');
}

const KNOWN_ACTORS = [
  'AWS',
  'AMD',
  'NVIDIA',
  'Dell',
  'Microsoft',
  'Google',
  'Oracle',
  'Meta',
  'OpenAI',
  'CoreWeave',
  'Blackstone',
  'Applied Digital',
  'Virginia',
  'Fiber Connect',
  'Green Capital',
  'Prime Capital',
];

function sourceTitle(cluster = {}) {
  const title = cluster.representative_source?.original?.title || cluster.cluster_title || '';
  return String(title)
    .replace(/\s+\|\s+.*$/, '')
    .replace(/^([^:]{3,80}):\s+\1[:\s-]*/i, '$1 ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanActor(actor = '') {
  return String(actor)
    .replace(/\b(The Close|Today|Company|SKUs|Out|Up|Cores|At)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function watchlistActor(cluster = {}) {
  const title = sourceTitle(cluster);
  if (/^chip stocks bounce/i.test(title)) return 'The chip-stock rebound';
  const titleMatch = KNOWN_ACTORS.find((actor) => new RegExp(`\\b${actor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(title));
  if (titleMatch) return titleMatch;
  const companyMatch = (cluster.companies || []).map(cleanActor).find((name) => name && name.length <= 28 && /^[A-Z0-9]/.test(name));
  if (companyMatch) return companyMatch;
  return title.split(/\s+/).slice(0, 4).join(' ') || cluster.cluster_topic || 'This signal';
}

function watchlistFocus(cluster = {}) {
  const title = sourceTitle(cluster);
  if (/generator|permitting|community|deq|zoning|moratorium/i.test(title)) return 'generator permitting and local approval risk';
  if (/fiber|network|connectivity|quantum/i.test(title)) return 'AI-era fiber and network readiness';
  if (/powerstore|storage|poweredge/i.test(title)) return 'storage and server refresh timing';
  if (/epyc|cpu|server|cores|tdp/i.test(title)) return 'lower-power server CPU planning';
  if (/chip|semiconductor|yield|foundry/i.test(title)) return 'semiconductor market risk';
  return `${String(cluster.primary_infrastructure_layer || cluster.cluster_topic || 'infrastructure').toLowerCase()} planning`;
}

function watchlistGap(cluster = {}) {
  const title = sourceTitle(cluster);
  if (/generator|permitting|community|deq|zoning|moratorium/i.test(title)) return 'verified compliance deadlines, operator exposure, and permitting outcomes';
  if (/fiber|network|connectivity|quantum/i.test(title)) return 'verified deployment locations, buyer commitments, and network-capacity impact';
  if (/powerstore|storage|poweredge/i.test(title)) return 'verified enterprise adoption, refresh timing, and capacity-management impact';
  if (/epyc|cpu|server|cores|tdp/i.test(title)) return 'verified OEM adoption, pricing, and workload-density evidence';
  if (/chip|semiconductor|yield|foundry/i.test(title)) return 'evidence linking market pricing to capacity plans or supplier capex';
  return 'verified timing, cost, capacity, or customer impact';
}

function watchlistCopy(cluster = {}) {
  const actor = watchlistActor(cluster);
  const focus = watchlistFocus(cluster);
  const gap = watchlistGap(cluster);
  const source = cluster.representative_source?.source_name || cluster.representative_source?.original?.source || 'The source';
  const count = Number(cluster.source_count || cluster.sources?.length || 1);
  const deck = `${actor}'s ${focus} signal needs ${gap} before it becomes a full Compute Current analysis.`;
  const why = `${source} is useful for monitoring ${focus}, but the desk held the item until ${gap} ${count > 1 ? 'appears consistently across the cluster' : 'appears beyond the representative source'}.`;
  return { deck, why };
}

export async function regenerateAutonomousAnalysesV1(options = {}) {
  const [latest, archived, cycles] = await Promise.all([
    readJsonFile(LATEST_NEWS_PATH, []),
    readJsonFile(ARCHIVE_NEWS_PATH, []),
    readEditorialCycles(),
  ]);
  const scan = await runGlobalSourceScan({ useLive: false });
  const clusters = scoreSignalClusters(clusterSignalItems(scan.clean_items), { now: new Date().toISOString() });
  const selection = selectEditorialSignals(clusters, { maxLongform: options.maxBackfill || 10 });
  const top = selection.ranked_candidates
    .filter((cluster) => ['Featured Analysis', 'Standard Analysis'].includes(cluster.editorial_route))
    .slice(0, options.maxBackfill || 10);
  const generated = [];
  const claimLedgers = [];
  const qualityRejected = [];
  for (const [index, cluster] of top.entries()) {
    const result = writeAutonomousBlogArticle(
      { ...cluster, editorial_route: index < 3 ? 'Featured Analysis' : 'Standard Analysis' },
      {
        index,
        recent: generated,
        backfilled: true,
        cycleId: 'historical_backfill_autonomous_v1',
      }
    );
    if (result.ok) {
      const detailQuality = articleDetailQualityResult(result.article);
      if (detailQuality.ok) {
        generated.push(result.article);
        claimLedgers.push(...result.ledger);
      } else {
        qualityRejected.push({
          cluster_id: cluster.cluster_id,
          title: cluster.cluster_title,
          reasons: detailQuality.reasons,
        });
      }
    }
  }
  const latestCyclePublished = new Set((cycles[0]?.published_analyses || []));
  const preservedCurrentCycle = latest
    .filter((article) => article.generation_version === AUTONOMOUS_VERSION && latestCyclePublished.has(article.id) && article.backfilledAnalysis !== true);
  const watchlist = selection.held_signals.slice(0, 20).map((cluster, index) => {
    const rep = cluster.representative_source?.original || {};
    const { deck, why } = watchlistCopy(cluster);
    const sourceUrl = cluster.representative_source?.source_url || rep.sourceUrl || rep.url;
    return {
      id: `watch_${cluster.cluster_id}`,
      title: cluster.cluster_title,
      source: cluster.representative_source?.source_name || rep.source || 'Source',
      sourceUrl,
      url: sourceUrl,
      publishedAt: cluster.last_seen_at || rep.publishedAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      generation_version: AUTONOMOUS_VERSION,
      public_generation_version: AUTONOMOUS_VERSION,
      public_status: 'watchlist',
      article_type: 'Watchlist Signal',
      publishing_route: 'Watchlist Signal',
      homepagePublished: true,
      articlePagePublished: false,
      signalCardOnly: true,
      archiveOnly: false,
      noindex: true,
      seo_noindex: true,
      infrastructure_relevance_score: Math.max(0.55, Number(cluster.signal_score || 55) / 100),
      extraction_quality_score: 0.9,
      primary_category: cluster.primary_infrastructure_layer || 'AI Infrastructure',
      infrastructure_layer: cluster.primary_infrastructure_layer,
      region: cluster.regions?.[0] || 'Global',
      deck,
      why_it_matters: why,
      summary: why,
      snippet: deck,
      excerpt: deck,
      contentText: `${deck} ${why}`,
      articleText: `${deck} ${why}`,
      fullArticleText: `${deck} ${why}`,
      cleaned_source_text: `${deck} ${why}`,
      source_evidence_text: `${deck} ${why}`,
      rawText: '',
      expertLensShort: deck,
      expertLens: deck,
      expertLensFull: {
        finalHeadline: cluster.cluster_title,
        metaDescription: deck,
        finalArticleBody: '',
        sourceLink: sourceUrl || '',
      },
      searchText: [cluster.cluster_title, deck, why, cluster.primary_infrastructure_layer, cluster.regions?.join(' ')].filter(Boolean).join(' '),
      public_presentation: {
        signal_label: 'Watchlist',
        editorial_lens: cluster.cluster_topic || 'Infrastructure Watch',
        title: cluster.cluster_title,
        deck,
        why_it_matters: why,
        reader_impact: ['Operators', 'Capacity planners'],
        region: cluster.regions?.[0] || 'Global',
        source: cluster.representative_source?.source_name || 'Source',
        view_detail: '',
        read_source: sourceUrl || '',
        lane_key: 'active-watchlist',
        lane_title: 'Active Watchlist',
        visibility: 'watchlist',
      },
      public_routing: {
        visibility: 'watchlist',
        laneKey: 'active-watchlist',
        laneTitle: 'Active Watchlist',
        score: Number(cluster.signal_score || 55) / 100,
      },
      signal_cluster_id: cluster.cluster_id,
      sort_index: index,
    };
  });

  const latestOut = uniqueById([...preservedCurrentCycle, ...generated, ...watchlist]).slice(0, 30);
  const currentIds = new Set(latestOut.map((article) => article.id));
  const oldArchived = uniqueById([...latest, ...archived].map((article) => archiveOld(article, currentIds)).filter(Boolean));
  const archiveOut = uniqueById([...oldArchived, ...generated.slice(latestOut.length)]);
  const searchOut = uniqueById([
    ...latestOut,
    ...archiveOut.filter((article) => article.generation_version === AUTONOMOUS_VERSION && article.archiveOnly !== true && article.noindex !== true && article.public_status !== 'archive_only_noindex'),
  ]).map((article) => ({ ...article, searchText: searchText(article) }));

  await Promise.all([
    writeSignalClusters(clusters),
    writeClaimLedger(claimLedgers),
    writeJsonFile('src/data/source-health.json', scan.source_health),
    writeJsonFile(LATEST_NEWS_PATH, latestOut),
    writeJsonFile(ARCHIVE_NEWS_PATH, archiveOut),
    writeJsonFile(SEARCH_INDEX_PATH, searchOut),
  ]);

  const reportLines = [
    '# Autonomous Editorial Desk Migration Report',
    '',
    `Generated at: ${new Date().toISOString()}`,
    '',
    `Generation version: ${AUTONOMOUS_VERSION}`,
    `Source items scanned: ${scan.source_items.length}`,
    `Clean items: ${scan.clean_items.length}`,
    `Signal clusters built: ${clusters.length}`,
    `Backfilled analyses generated: ${generated.length}`,
    `Generated analyses rejected by detail gate: ${qualityRejected.length}`,
    `Watchlist signals retained: ${watchlist.length}`,
    `Old template articles archived/noindexed: ${oldArchived.filter((article) => article.public_status === 'archive_only_noindex').length}`,
    '',
    '## Backfilled Analyses',
    '',
    '| Title | Route | Words | Facts | Claims | Source |',
    '| --- | --- | --- | --- | --- | --- |',
    ...generated.map((article) => `| ${String(article.title).replace(/\|/g, '/')} | ${article.publishing_route} | ${article.blog_metadata?.word_count || 0} | ${article.evidence_pack?.verified_facts?.length || 0} | ${article.claim_ledger?.length || 0} | ${article.source || ''} |`),
    '',
    '## Generated But Held',
    '',
    qualityRejected.length
      ? qualityRejected.map((item) => `- ${item.title}: ${item.reasons.join(', ')}`).join('\n')
      : '- None',
    '',
    'Backfilled articles are labeled with `backfilledAnalysis: true` and are not represented as latest 8-hour cycle output.',
  ];
  await fs.mkdir(path.dirname(REPORT_PATH), { recursive: true });
  await fs.writeFile(REPORT_PATH, `${reportLines.join('\n')}\n`, 'utf8');
  return { generated, watchlist, clusters, claimLedgers, reportPath: REPORT_PATH };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const result = await regenerateAutonomousAnalysesV1();
  console.log(`autonomous analyses regenerated: ${result.generated.length}`);
  console.log(`report: ${path.relative(ROOT, result.reportPath)}`);
}
