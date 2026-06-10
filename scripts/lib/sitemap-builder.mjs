import { shouldNoindexArticle } from '../../src/lib/seo-safeguards.js';
import { CATEGORY_PAGES } from './taxonomy-page-builder.mjs';
import { DEFAULT_COMPANIES } from './company-entity-index.mjs';
import { DEFAULT_REGIONS } from './region-index.mjs';
import { articleOpenGraphImage, isTrustedPublicImage } from './article-image-surface.mjs';

function slugify(value = '') {
  return String(value).toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function buildSitemapEntries(items = []) {
  const now = new Date().toISOString();
  const staticPages = [
    '/',
    '/about/',
    '/methodology/',
    '/editorial-policy/',
    '/ai-disclosure/',
    '/archive/',
    '/subscribe/',
    '/pricing/',
    '/sample/',
    '/briefing/',
    '/contact/',
  ];
  const articlePages = items
    .filter((item) => item?.id && item.articlePagePublished !== false && item.archiveOnly !== true && item.public_status !== 'archive_only_noindex' && item.public_status !== 'quarantined' && !shouldNoindexArticle(item))
    .map((item) => {
      const image = articleOpenGraphImage(item);
      return {
        loc: `/news/${item.id}/`,
        lastmod: item.updatedAt || item.analysisPublishedAt || item.publishedAt || now,
        image: isTrustedPublicImage(image) ? image : '',
      };
    });
  const taxonomy = [
    ...CATEGORY_PAGES.map(([slug]) => `/category/${slug}/`),
    ...DEFAULT_REGIONS.map((name) => `/region/${slugify(name)}/`),
    ...DEFAULT_COMPANIES.map((name) => `/company/${slugify(name)}/`),
  ].map((loc) => ({ loc, lastmod: now }));
  return [
    ...staticPages.map((loc) => ({ loc, lastmod: now })),
    ...taxonomy,
    ...articlePages,
  ];
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

export function sitemapXml(entries = [], site = 'https://www.computecurrent.com') {
  const hasImages = entries.some((entry) => entry.image);
  const body = entries.map((entry) => [
    '  <url>',
    `    <loc>${escapeXml(absoluteSiteUrl(entry.loc, site))}</loc>`,
    `    <lastmod>${new Date(entry.lastmod).toISOString()}</lastmod>`,
    entry.image
      ? [
          '    <image:image>',
          `      <image:loc>${escapeXml(absoluteSiteUrl(entry.image, site))}</image:loc>`,
          '    </image:image>',
        ].join('\n')
      : '',
    '  </url>',
  ].filter(Boolean).join('\n')).join('\n');
  const imageNamespace = hasImages ? ' xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"' : '';
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"${imageNamespace}>\n${body}\n</urlset>\n`;
}
