import latestNews from '../src/data/latest-news.json' with { type: 'json' };
import archivedNews from '../src/data/archived-news.json' with { type: 'json' };
import searchIndex from '../src/data/search-index.json' with { type: 'json' };
import taxonomyPages from '../src/data/taxonomy-pages.json' with { type: 'json' };
import { buildArchiveFeed } from './lib/archive-feed-builder.mjs';
import { buildHomepageFeed } from './lib/homepage-feed-builder.mjs';
import { isPublicLongformArticle } from './lib/public-surface-eligibility.mjs';
import { articleDisplayImage, localArticleImageExists } from './lib/article-image-surface.mjs';
import { isStockDerivedCardImage, stockDerivedImageReason } from './lib/stock-card-image-detector.mjs';

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

function taxonomyItems() {
  const pages = [
    ...(taxonomyPages.categories || []),
    ...(taxonomyPages.companies || []),
    ...(taxonomyPages.regions || []),
    ...(taxonomyPages.archive || []),
  ];
  return uniqueById(pages.flatMap((page) => page.items || []));
}

function imageFailures(label, items = []) {
  const failures = [];
  for (const item of uniqueById(items)) {
    const image = articleDisplayImage(item);
    if (!image) {
      failures.push(`${label}:${item.id}:missing_image`);
      continue;
    }
    if (!localArticleImageExists(image)) {
      failures.push(`${label}:${item.id}:missing_local_asset:${image}`);
    }
    if (isStockDerivedCardImage(item)) {
      failures.push(`${label}:${item.id}:stock_derived_image:${stockDerivedImageReason(item)}`);
    }
  }
  return failures;
}

export function auditPublicImages() {
  const allArticles = [...latestNews, ...archivedNews];
  const homepage = buildHomepageFeed(allArticles, { limit: 50, minimumVisible: 30 });
  const archive = buildArchiveFeed(allArticles, { page: 1, pageSize: 1000 });
  const longform = allArticles.filter(isPublicLongformArticle);
  const failures = [
    ...imageFailures('latest', latestNews),
    ...imageFailures('archive', archivedNews),
    ...imageFailures('search', searchIndex),
    ...imageFailures('taxonomy', taxonomyItems()),
    ...homepage.items
      .filter((item) => !item.publicSignal?.image)
      .map((item) => `homepage:${item.id}:missing_public_signal_image`),
    ...archive.items
      .filter((item) => !item.publicSignal?.image)
      .map((item) => `archive-feed:${item.id}:missing_public_signal_image`),
    ...longform
      .filter((item) => !articleDisplayImage(item))
      .map((item) => `longform:${item.id}:missing_article_image`),
  ];

  return {
    ok: failures.length === 0,
    failures,
    counts: {
      latest: latestNews.length,
      archive: archivedNews.length,
      search: searchIndex.length,
      taxonomy: taxonomyItems().length,
      homepage: homepage.items.length,
      archiveFeed: archive.items.length,
      longform: longform.length,
    },
  };
}

const result = auditPublicImages();
if (!result.ok) {
  console.error(`public image audit failed:\n${result.failures.slice(0, 80).join('\n')}`);
  process.exitCode = 1;
} else {
  console.log(
    `public image audit passed: latest=${result.counts.latest}, archive=${result.counts.archive}, search=${result.counts.search}, taxonomy=${result.counts.taxonomy}, homepage=${result.counts.homepage}, longform=${result.counts.longform}`
  );
}
