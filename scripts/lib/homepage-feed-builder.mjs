import { buildPublicPresentation } from './public-presentation.mjs';
import { routePublicLane } from './public-lane-router.mjs';
import { cardCopyQualityResult, generateCardCopy } from './card-copy-quality-gate.mjs';
import { publicEmptyStateText } from './public-empty-state-copy.mjs';
import { isPublicLongformArticle } from './public-surface-eligibility.mjs';
import {
  inferBottleneckAxis,
  orderByFirstViewportAxisDiversity,
} from './bottleneck-axis-diversity.mjs';

function dateMs(article = {}) {
  const ms = new Date(article.analysisPublishedAt || article.publishedAt || article.updatedAt || 0).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function publicEligible(article = {}) {
  if (!article?.id) return false;
  if (article.homepagePublished === false) return false;
  if (article.archiveOnly === true) return false;
  if (article.public_content_tier === 'hidden') return false;
  if (article.public_status === 'quarantined' || article.public_status === 'archive_only_noindex') return false;
  return true;
}

function canonicalFeedKey(article = {}) {
  const url = String(article.sourceUrl || article.url || article.link || '').trim().toLowerCase();
  if (url) return `url:${url.replace(/[?#].*$/, '')}`;
  const title = String(article.title || article.expertLensFull?.finalHeadline || '').trim().toLowerCase();
  const source = String(article.source || article.source_name || '').trim().toLowerCase();
  return `title:${source}:${title}`;
}

function dedupeFeedItems(items = []) {
  const seen = new Set();
  const deduped = [];
  for (const item of items) {
    const key = canonicalFeedKey(item);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
  }
  return deduped;
}

function decorate(article = {}, options = {}) {
  const fallbackRoute = routePublicLane(article);
  const articleRoute = article.public_routing || fallbackRoute;
  const route = article.public_content_tier && article.public_content_tier !== 'hidden' && articleRoute.visibility === 'archive'
    ? {
        ...articleRoute,
        visibility: article.public_content_tier === 'longform_analysis' ? 'core' : 'adjacent',
        laneKey: 'latest-analysis',
        laneTitle: 'Latest Analysis',
        editorial_lens: 'AI Infrastructure',
        public_signal_label: article.public_content_tier === 'longform_analysis'
          ? 'Analysis'
          : article.public_content_tier === 'signal_card'
            ? 'Signal'
            : 'Brief',
      }
    : articleRoute;
  const presentation = buildPublicPresentation(article, { route, recentDecks: options.recentDecks || [] });
  const copy = generateCardCopy(article);
  const bottleneckAxis = inferBottleneckAxis(article);
  const copyQuality = cardCopyQualityResult(copy, article);
  if (!copyQuality.ok) {
    return null;
  }
  const detailHref = isPublicLongformArticle(article) ? `/news/${article.id}/` : '';
  return {
    ...article,
    publicSignal: {
      ...presentation,
      signal_label: copy.signal_label,
      label: copy.label,
      title: copy.title,
      deck: copy.deck,
      why_it_matters: copy.why_it_matters,
      source: copy.source,
      date: copy.date,
      category: copy.category,
      cta: copy.cta,
      bottleneck_axis: bottleneckAxis,
      view_detail: detailHref,
      read_source: article.sourceUrl || article.url || presentation.read_source || '',
    },
  };
}

export function buildHomepageFeed(items = [], options = {}) {
  const limit = options.limit || 50;
  const minimumVisible = options.minimumVisible || 30;
  const sorted = dedupeFeedItems(items
    .filter(publicEligible)
    .sort((a, b) => dateMs(b) - dateMs(a)));
  const visible = orderByFirstViewportAxisDiversity(
    sorted.slice(0, Math.max(Math.min(limit, sorted.length), Math.min(minimumVisible, sorted.length))),
    { firstViewportCount: options.firstViewportCount || 5 },
  );
  const recentDecks = [];
  const decorated = visible.map((article) => {
    const entry = decorate(article, { recentDecks });
    if (entry?.publicSignal?.deck) recentDecks.push(entry.publicSignal.deck);
    return entry;
  }).filter(Boolean);
  const featured = decorated[0] || null;
  return {
    items: decorated,
    featured,
    sections: [
      {
        id: 'latest-analysis',
        title: 'Latest Analysis',
        items: decorated,
      },
    ],
    emptyState: publicEmptyStateText(sorted.length ? 'more_analysis' : 'no_latest_items'),
    filters: [
      'All',
      'Power & Grid',
      'Data Centers',
      'Cooling',
      'Silicon & Systems',
      'Cloud Capacity',
      'Capital & Deals',
      'Policy & Siting',
      'Enterprise Infrastructure',
    ],
  };
}

export { publicEligible as publicHomepageFeedEligible };
export { canonicalFeedKey, dedupeFeedItems };
