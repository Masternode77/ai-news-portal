import { latestEditorialCycle } from './editorial-cycle-store.mjs';
import { buildFreshnessPublicModel } from './freshness-public-model.mjs';
import { routePublicLane } from './public-lane-router.mjs';
import { buildPublicPresentation } from './public-presentation.mjs';
import { articleDetailQualityEligible } from './article-detail-quality-gate.mjs';

function publicArticle(article = {}) {
  return article?.id
    && article.articlePagePublished !== false
    && article.archiveOnly !== true
    && article.public_status !== 'quarantined'
    && article.public_status !== 'archive_only_noindex'
    && article.seo_noindex !== true
    && articleDetailQualityEligible(article);
}

function watchlistArticle(article = {}) {
  return article?.id
    && article.archiveOnly !== true
    && article.public_status !== 'archive_only_noindex'
    && article.public_status !== 'quarantined'
    && (article.articlePagePublished === false || /watchlist|short/i.test(`${article.article_type || article.publishing_route || article.public_status || ''}`));
}

function decorate(article = {}) {
  const route = article.public_routing || routePublicLane(article);
  return {
    ...article,
    publicSignal: buildPublicPresentation(article, { route }),
  };
}

function uniqueById(items = []) {
  const seen = new Set();
  return items.filter((item) => {
    if (!item?.id || seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

export function buildHomepageEditorialModel({ latest = [], archived = [], cycles = [], clusters = [], sourceHealth = [] } = {}) {
  const latestCycle = latestEditorialCycle(cycles);
  const cycleIds = new Set(latestCycle?.published_analyses || []);
  const all = uniqueById([...latest, ...archived]);
  const publicAnalyses = all.filter(publicArticle).sort((a, b) => new Date(b.analysisPublishedAt || b.updatedAt || b.publishedAt || 0) - new Date(a.analysisPublishedAt || a.updatedAt || a.publishedAt || 0));
  const featuredAnalyses = publicAnalyses.filter((article) => cycleIds.has(article.id) && article.backfilledAnalysis !== true).slice(0, 3).map(decorate);
  const recentAnalysis = publicAnalyses.filter((article) => !featuredAnalyses.some((featured) => featured.id === article.id)).slice(0, 12).map(decorate);
  const activeWatchlist = all
    .filter(watchlistArticle)
    .sort((a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0))
    .slice(0, 20)
    .map(decorate);
  const freshness = buildFreshnessPublicModel({
    cycles,
    rssItems: publicAnalyses,
    sourceHealth,
  });
  return {
    latestCycle,
    freshness,
    featuredAnalyses,
    activeWatchlist,
    recentAnalysis,
    clusters,
    stats: {
      activeSignals: activeWatchlist.length,
      sourcesMonitored: sourceHealth.length || 0,
      publishedAnalysesIndexed: publicAnalyses.length,
      heldThisCycle: latestCycle?.held_signals?.length || 0,
      publishedThisCycle: featuredAnalyses.length,
    },
  };
}
