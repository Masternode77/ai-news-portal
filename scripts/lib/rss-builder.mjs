import { cleanEditorialText, displayHeadline } from '../../src/lib/editorial-display.js';
import { rssItemEligible } from './seo-quality-policy.mjs';

export function buildRssItems(items = []) {
  return items
    .filter((item) => item?.id && item?.publishedAt && rssItemEligible(item) && item.archiveOnly !== true && item.public_status !== 'archive_only_noindex')
    .sort((a, b) => new Date(b.analysisPublishedAt || b.publishedAt).getTime() - new Date(a.analysisPublishedAt || a.publishedAt).getTime())
    .slice(0, 100)
    .map((item) => ({
      title: displayHeadline(item),
      pubDate: new Date(item.analysisPublishedAt || item.publishedAt),
      description: cleanEditorialText(item.deck || item.expertLensShort || item.summary || item.snippet || ''),
      link: item.articlePagePublished === false ? item.sourceUrl || item.url || '/' : `/news/${item.id}/`,
    }));
}

export function rssMetadata() {
  return {
    title: 'Compute Current',
    description: 'AI infrastructure intelligence',
    site: 'https://www.computecurrent.com',
  };
}
