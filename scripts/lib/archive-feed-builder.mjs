import { buildHomepageFeed, dedupeFeedItems } from './homepage-feed-builder.mjs';
import { publicEmptyStateText } from './public-empty-state-copy.mjs';
import { isPublicProductFit } from './public-product-fit.mjs';

function dateMs(article = {}) {
  const ms = new Date(article.analysisPublishedAt || article.publishedAt || article.updatedAt || 0).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function archiveEligible(article = {}) {
  if (!article?.id) return false;
  if (!isPublicProductFit(article)) return false;
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
  const allFeed = buildHomepageFeed(publicItems, { ...options, limit: publicItems.length, minimumVisible: 0 });
  const pageItems = allFeed.items.slice((page - 1) * pageSize, page * pageSize);
  return {
    ...allFeed,
    items: pageItems,
    featured: pageItems[0] || null,
    sections: allFeed.sections.map((section) => ({ ...section, items: pageItems })),
    total: allFeed.items.length,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(allFeed.items.length / pageSize)),
    searchLabel: 'Search the archive',
    emptyState: publicEmptyStateText(allFeed.items.length ? 'more_analysis' : 'no_latest_items'),
  };
}

export { archiveEligible as publicArchiveEligible };
