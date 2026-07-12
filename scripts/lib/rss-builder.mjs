import { cleanEditorialText } from '../../src/lib/editorial-display.js';
import { sanitizePublicCopy } from './internal-language-guard.mjs';
import { cardCopyQualityResult, generateCardCopy } from './card-copy-quality-gate.mjs';
import { articleOpenGraphImage, isTrustedPublicImage } from './article-image-surface.mjs';
import { isPublicLongformArticle, isPublicRssArticle } from './public-surface-eligibility.mjs';
import { safeSourceUrlFor } from '../../src/lib/seo-safeguards.js';

function rssLinkFor(item = {}) {
  return isPublicLongformArticle(item) ? `/news/${item.id}/` : safeSourceUrlFor(item);
}

function absoluteSiteUrl(pathOrUrl = '', site = 'https://www.computecurrent.com') {
  const value = String(pathOrUrl || '').trim();
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  return `${site.replace(/\/$/, '')}/${value.replace(/^\//, '')}`;
}

function escapeXml(value = '') {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function imageType(image = '') {
  if (/\.svg(?:$|\?)/i.test(image)) return 'image/svg+xml';
  if (/\.png(?:$|\?)/i.test(image)) return 'image/png';
  if (/\.jpe?g(?:$|\?)/i.test(image)) return 'image/jpeg';
  return 'image/webp';
}

function rssImageFor(item = {}) {
  const image = articleOpenGraphImage(item);
  return isTrustedPublicImage(image) ? image : '';
}

export function buildRssItems(items = []) {
  const seenLinks = new Set();
  const out = [];

  for (const item of items
    .filter((item) => item?.id && item?.publishedAt && isPublicRssArticle(item))
    .sort((a, b) => new Date(b.analysisPublishedAt || b.publishedAt).getTime() - new Date(a.analysisPublishedAt || a.publishedAt).getTime())) {
    const link = rssLinkFor(item);
    if (!link) continue;
    if (seenLinks.has(link)) {
      continue;
    }

    const copy = generateCardCopy(item);
    if (!cardCopyQualityResult(copy, item).ok) {
      continue;
    }
    seenLinks.add(link);

    const image = rssImageFor(item);
    out.push({
      title: copy.title,
      pubDate: new Date(item.analysisPublishedAt || item.publishedAt),
      description: sanitizePublicCopy(cleanEditorialText(copy.deck || item.deck || item.expertLensShort || item.summary || item.snippet || '')),
      link,
      image,
      customData: image
        ? `<media:content url="${escapeXml(absoluteSiteUrl(image))}" medium="image" type="${imageType(image)}" />`
        : '',
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
    xmlns: {
      media: 'http://search.yahoo.com/mrss/',
    },
  };
}
