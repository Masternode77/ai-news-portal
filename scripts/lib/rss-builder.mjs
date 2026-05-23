import { cleanEditorialText, displayHeadline } from '../../src/lib/editorial-display.js';
import { rssItemEligible } from './seo-quality-policy.mjs';
import { sanitizePublicCopy } from './internal-language-guard.mjs';
import { generateCardCopy } from './card-copy-quality-gate.mjs';

export function buildRssItems(items = []) {
  return items
    .filter((item) => item?.id && item?.publishedAt && rssItemEligible(item) && item.archiveOnly !== true && item.public_status !== 'archive_only_noindex')
    .sort((a, b) => new Date(b.analysisPublishedAt || b.publishedAt).getTime() - new Date(a.analysisPublishedAt || a.publishedAt).getTime())
    .slice(0, 100)
    .map((item) => {
      const copy = generateCardCopy(item);
      return {
      title: sanitizePublicCopy(displayHeadline(item)),
      pubDate: new Date(item.analysisPublishedAt || item.publishedAt),
      description: sanitizePublicCopy(cleanEditorialText(copy.deck || item.deck || item.expertLensShort || item.summary || item.snippet || '')),
      link: item.articlePagePublished === false ? item.sourceUrl || item.url || '/' : `/news/${item.id}/`,
      };
    });
}

export function rssMetadata() {
  return {
    title: 'Compute Current',
    description: 'AI infrastructure intelligence',
    site: 'https://www.computecurrent.com',
  };
}
