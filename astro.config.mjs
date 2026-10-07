// @ts-check
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { articleCanonicalPath, shouldNoindexArticle } from './src/lib/seo-safeguards.js';
import { buildPublicPublicationCatalog } from './scripts/lib/public-publication-catalog.mjs';
import { buildHomepageFeed } from './scripts/lib/homepage-feed-builder.mjs';
import { eligibleHeadlineSourceIds, headlinesFor } from './scripts/lib/industry-headlines-view.mjs';
import { loadSourceRegistrySync } from './scripts/lib/source-registry.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const loadArticles = (filename) => {
  try {
    return JSON.parse(fs.readFileSync(path.join(__dirname, 'src/data', filename), 'utf8'));
  } catch {
    return [];
  }
};
const noindexArticlePaths = new Set(
  [...loadArticles('latest-news.json'), ...loadArticles('archived-news.json')]
    .filter((article) => article?.id && shouldNoindexArticle(article))
    .map((article) => articleCanonicalPath(article))
);
const noindexStaticPaths = new Set(['/subscribe/', '/pricing/', '/sample/', '/briefing/']);
const publicCatalog = buildPublicPublicationCatalog({
  articles: [...loadArticles('latest-news.json'), ...loadArticles('archived-news.json')],
  columns: loadArticles('authored-columns.json'),
});
const activeCategoryPaths = new Set(publicCatalog.map((item) => `/category/${item.categorySlug}/`));
const activeRegionPaths = new Set(publicCatalog.map((item) => `/region/${item.regionSlug}/`));
const taxonomyPages = loadArticles('taxonomy-pages.json');
const industryHeadlines = loadArticles('industry-headlines.json');
const companyNow = new Date();
const headlineSourceIds = eligibleHeadlineSourceIds(loadSourceRegistrySync(), companyNow);
const activeCompanyPaths = new Set((taxonomyPages.companies || [])
  .filter((page) => buildHomepageFeed(page.items || [], { limit: 1, minimumVisible: 0 }).items.length > 0
    || headlinesFor(industryHeadlines, { language: 'en', limit: 1, company: page.name, sourceIds: headlineSourceIds, now: companyNow }).length > 0)
  .map((page) => `/company/${page.slug}/`));

const pagePath = (page) => {
  try {
    return new URL(page).pathname;
  } catch {
    return page;
  }
};

export default defineConfig({
  site: 'https://www.computecurrent.com',
  integrations: [
    sitemap({
      filter: (page) => {
        const pathname = pagePath(page);
        return !pathname.startsWith('/admin')
          && !pathname.startsWith('/api/admin')
          && !noindexStaticPaths.has(pathname)
          && !noindexArticlePaths.has(pathname)
          && (!pathname.startsWith('/category/') || activeCategoryPaths.has(pathname))
          && (!pathname.startsWith('/region/') || activeRegionPaths.has(pathname))
          && (!pathname.startsWith('/company/') || activeCompanyPaths.has(pathname));
      },
    }),
  ],
  redirects: {
    '/column/malaysia-collapsed-a-multi-billion-dollar-server-smuggling-route-2026-10-04/': {
      status: 301,
      destination: '/column/malaysia-server-trade-gap-permit-enforcement-2026-10-04/',
    },
  },
  vite: {
    server: {
      allowedHosts: true,
    },
    preview: {
      allowedHosts: true,
    },
  },
});
