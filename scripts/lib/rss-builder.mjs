import { cleanEditorialText, displayHeadline } from '../../src/lib/editorial-display.js';
import { rssItemEligible } from './seo-quality-policy.mjs';
import { sanitizePublicCopy } from './internal-language-guard.mjs';
import { generateCardCopy } from './card-copy-quality-gate.mjs';

function rssLinkFor(item = {}) {
  return item.articlePagePublished === false ? item.sourceUrl || item.url || '/' : `/news/${item.id}/`;
}

export function buildRssItems(items = []) {
  const seenLinks = new Set();
  const out = [];

  for (const item of items
    .filter((item) => item?.id && item?.publishedAt && rssItemEligible(item) && item.archiveOnly !== true && item.public_status !== 'archive_only_noindex')
    .sort((a, b) => new Date(b.analysisPublishedAt || b.publishedAt).getTime() - new Date(a.analysisPublishedAt || a.publishedAt).getTime())) {
    const link = rssLinkFor(item);
    if (seenLinks.has(link)) {
      continue;
    }
    seenLinks.add(link);

    const copy = generateCardCopy(item);
    out.push({
      title: sanitizePublicCopy(displayHeadline(item)),
      pubDate: new Date(item.analysisPublishedAt || item.publishedAt),
      description: sanitizePublicCopy(cleanEditorialText(copy.deck || item.deck || item.expertLensShort || item.summary || item.snippet || '')),
      link,
    });

    if (out.length >= 100) {
      break;
    }
  }

  return out;
}

export function rssMetadata() {
  return {
    title: 'Compute Current',
    description: 'AI infrastructure intelligence',
    site: 'https://www.computecurrent.com',
  };
}
