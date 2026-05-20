import { buildPublicPresentation } from './public-presentation.mjs';

export const LAUNCH_LANES = [
  ['todays-constraint', "Today's Constraint"],
  ['operator-alerts', 'Operator Alerts'],
  ['investor-signals', 'Investor Signals'],
  ['stack-shifts', 'Stack Shifts'],
  ['policy-risk', 'Policy/Risk Watch'],
  ['technical-bottlenecks', 'Technical Bottlenecks'],
  ['market-maps', 'Market Maps'],
  ['adjacent-watchlist', 'Adjacent Watchlist'],
  ['source-watch', 'Source Watch'],
];

function isVisible(article = {}) {
  return article.homepagePublished !== false
    && article.archiveOnly !== true
    && article.public_status !== 'quarantined'
    && article.public_status !== 'archive_only_noindex';
}

function isLocal(article = {}) {
  return isVisible(article)
    && article.articlePagePublished !== false
    && article.signalCardOnly !== true
    && article.noindex !== true
    && article.seo_noindex !== true;
}

function isSource(article = {}) {
  return isVisible(article) && !isLocal(article);
}

function laneFor(article = {}) {
  if (isSource(article)) return 'source-watch';
  const explicit = article.public_routing?.laneKey || article.public_presentation?.lane_key;
  if (LAUNCH_LANES.some(([key]) => key === explicit)) return explicit;
  const text = `${article.public_routing?.laneKey || ''} ${article.public_route || ''} ${article.public_signal_label || ''} ${article.editorial_lens || ''} ${article.primary_category || ''}`;
  if (/power|grid/i.test(text)) return 'todays-constraint';
  if (/operator|data center|cooling|facility/i.test(text)) return 'operator-alerts';
  if (/investor|capital|deal|market/i.test(text)) return 'investor-signals';
  if (/cloud|platform|enterprise/i.test(text)) return 'stack-shifts';
  if (/policy|risk|siting|permit/i.test(text)) return 'policy-risk';
  if (/technical|semiconductor|memory|silicon|systems/i.test(text)) return 'technical-bottlenecks';
  if (/map|cartographer/i.test(text)) return 'market-maps';
  return 'adjacent-watchlist';
}

function decorate(article = {}) {
  const presentation = buildPublicPresentation(article, { route: article.public_routing });
  return {
    ...article,
    kind: isLocal(article) ? 'local' : 'source',
    publicSignal: {
      ...presentation,
      lane_key: laneFor(article),
      source_only: isSource(article),
      view_detail: isLocal(article) ? `/news/${article.id}/` : '',
      read_source: article.sourceUrl || article.url || presentation.read_source,
    },
  };
}

export function buildHomepageLaunchModel({ latest = [], archived = [], sourceHealth = [] } = {}) {
  const all = [...latest, ...archived].filter(Boolean);
  const visible = all
    .filter(isVisible)
    .sort((a, b) => new Date(b.analysisPublishedAt || b.updatedAt || b.publishedAt || 0) - new Date(a.analysisPublishedAt || a.updatedAt || a.publishedAt || 0));
  const local = visible.filter(isLocal);
  const sourceOnly = visible.filter(isSource);
  const featured = local.slice(0, 4).map(decorate);
  const laneItems = new Map(LAUNCH_LANES.map(([key, title]) => [key, { key, title, items: [] }]));

  for (const item of [...local.slice(4), ...sourceOnly]) {
    const decorated = decorate(item);
    const key = decorated.publicSignal.lane_key;
    if (!laneItems.has(key)) laneItems.set(key, { key, title: key, items: [] });
    laneItems.get(key).items.push(decorated);
  }

  const lanes = [...laneItems.values()]
    .map((lane) => ({ ...lane, items: lane.items.slice(0, lane.key === 'source-watch' ? 6 : 8) }))
    .filter((lane) => lane.items.length);

  return {
    hero: {
      title: 'Compute Current',
      subtitle: 'AI Infrastructure Intelligence',
      positioning: 'Decision-grade intelligence on the constraints behind the AI buildout: power, capacity, chips, cooling, cloud, capital, and siting risk.',
      cta: 'Get the Daily AI Infrastructure Brief',
    },
    featured,
    lanes,
    stats: {
      liveLocalArticles: local.length,
      watchlistSignals: sourceOnly.length,
      archiveCount: all.filter((item) => item.archiveOnly || item.noindex || item.public_status === 'quarantined').length,
      sourceHealth: sourceHealth.filter((source) => source.quality_score >= 0.75 || source.status === 'active').length || sourceHealth.length,
      visibleItems: visible.length,
      sourceOnlyRatio: Number((sourceOnly.length / Math.max(visible.length, 1)).toFixed(2)),
    },
    targets: {
      minimumVisibleItems: 20,
      minimumLocalArticles: 12,
      minimumFullArticles: 6,
      maxSourceOnlyRatio: 0.3,
    },
    targetStatus: {
      visibleItems: visible.length >= 20,
      localArticles: local.length >= 12,
      fullArticles: local.filter((item) => /Core Longform Blog|Standard Blog/i.test(item.public_route || '')).length >= 6,
      sourceOnlyRatio: sourceOnly.length / Math.max(visible.length, 1) <= 0.3,
    },
  };
}
