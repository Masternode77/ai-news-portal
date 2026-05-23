import { buildHomepageFeed, dedupeFeedItems } from './homepage-feed-builder.mjs';
import { publicEmptyStateText } from './public-empty-state-copy.mjs';

function dateMs(article = {}) {
  const ms = new Date(article.analysisPublishedAt || article.publishedAt || article.updatedAt || 0).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function archiveEligible(article = {}) {
  if (!article?.id) return false;
  if (article.archiveOnly === true) return false;
  if (article.seo_noindex === true && article.public_content_tier !== 'signal_card') return false;
  if (article.public_content_tier === 'hidden') return false;
  if (article.public_status === 'quarantined' || article.public_status === 'archive_only_noindex') return false;
  return true;
}

export function buildArchiveFeed(items = [], options = {}) {
  const pageSize = options.pageSize || 50;
  const publicItems = dedupeFeedItems(items
    .filter(archiveEligible)
    .sort((a, b) => dateMs(b) - dateMs(a)));
  const page = Math.max(1, Number(options.page || 1));
  const pageItems = publicItems.slice((page - 1) * pageSize, page * pageSize);
  const feed = buildHomepageFeed(pageItems, { limit: pageSize, minimumVisible: 0 });
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
