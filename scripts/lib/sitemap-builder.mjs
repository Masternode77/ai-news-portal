import { CATEGORY_PAGES } from './taxonomy-page-builder.mjs';
import { buildCompanyIndex } from './company-entity-index.mjs';
import { buildRegionIndex } from './region-index.mjs';
import { articleOpenGraphImage, isTrustedPublicImage } from './article-image-surface.mjs';
import { isPublicLongformArticle } from './public-surface-eligibility.mjs';

function lastModifiedFor(items = []) {
  const timestamps = items
    .flatMap((item) => [item.updatedAt, item.analysisPublishedAt, item.publishedAt])
    .map((value) => new Date(value || 0).getTime())
    .filter(Number.isFinite);
  return new Date(timestamps.length ? Math.max(...timestamps) : 0).toISOString();
}

export function buildSitemapEntries(items = []) {
  const lastmod = lastModifiedFor(items);
  const staticPages = [
    '/',
    '/archive/',
  ];
  const articlePages = items
    .filter(isPublicLongformArticle)
    .map((item) => {
      const image = articleOpenGraphImage(item);
      return {
        loc: `/news/${item.id}/`,
        lastmod: item.updatedAt || item.analysisPublishedAt || item.publishedAt || lastmod,
        image: isTrustedPublicImage(image) ? image : '',
      };
    });
  const taxonomy = [
    ...CATEGORY_PAGES.map(([slug]) => `/category/${slug}/`),
    ...buildRegionIndex(items).map((page) => `/region/${page.slug}/`),
    ...buildCompanyIndex(items).map((page) => `/company/${page.slug}/`),
  ].map((loc) => ({ loc, lastmod }));
  return [
    ...staticPages.map((loc) => ({ loc, lastmod })),
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
