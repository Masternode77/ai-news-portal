import { buildHomepageFeed, dedupeFeedItems, publicCardPresentable } from './homepage-feed-builder.mjs';
import { publicEmptyStateText } from './public-empty-state-copy.mjs';
import { isPublicArchiveArticle } from './public-surface-eligibility.mjs';

function dateMs(article = {}) {
  const ms = new Date(article.analysisPublishedAt || article.publishedAt || article.updatedAt || 0).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function archiveEligible(article = {}) {
  return isPublicArchiveArticle(article);
}

export function buildArchiveFeed(items = [], options = {}) {
  const pageSize = options.pageSize || 50;
  const publicItems = dedupeFeedItems(items
    .filter(archiveEligible)
    .filter(publicCardPresentable)
    .sort((a, b) => dateMs(b) - dateMs(a)));
  const page = Math.max(1, Number(options.page || 1));
  const pageItems = publicItems.slice((page - 1) * pageSize, page * pageSize);
  const feed = buildHomepageFeed(pageItems, {
    limit: pageSize,
    minimumVisible: 0,
    eligibility: isPublicArchiveArticle,
    longformMaxAgeDays: Number.POSITIVE_INFINITY,
  });
  return {
    ...feed,
    total: publicItems.length,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(publicItems.length / pageSize)),
    searchLabel: 'Search the archive',
    emptyState: publicEmptyStateText(publicItems.length ? 'more_analysis' : 'no_latest_items'),
  };
}

export { archiveEligible as publicArchiveEligible };
