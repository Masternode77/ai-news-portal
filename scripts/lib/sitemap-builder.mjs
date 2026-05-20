import { shouldNoindexArticle } from '../../src/lib/seo-safeguards.js';
import { isIndexableLocalArticle } from './seo-launch-policy.mjs';
import { CATEGORY_PAGES } from './taxonomy-page-builder.mjs';
import { DEFAULT_COMPANIES } from './company-entity-index.mjs';
import { DEFAULT_REGIONS } from './region-index.mjs';

function slugify(value = '') {
  return String(value).toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function buildSitemapEntries(items = []) {
  const now = new Date().toISOString();
  const staticPages = ['/', '/about/', '/methodology/', '/editorial-policy/', '/ai-disclosure/', '/subscribe/', '/archive/'];
  const articlePages = items
    .filter((item) => isIndexableLocalArticle(item) && !shouldNoindexArticle(item))
    .map((item) => ({ loc: `/news/${item.id}/`, lastmod: item.updatedAt || item.analysisPublishedAt || item.publishedAt || now }));
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

export function sitemapXml(entries = [], site = 'https://www.computecurrent.com') {
  const body = entries.map((entry) => [
    '  <url>',
    `    <loc>${site.replace(/\/$/, '')}${entry.loc}</loc>`,
    `    <lastmod>${new Date(entry.lastmod).toISOString()}</lastmod>`,
    '  </url>',
  ].join('\n')).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}
