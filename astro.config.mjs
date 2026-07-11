// @ts-check
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { articleCanonicalPath, shouldNoindexArticle } from './src/lib/seo-safeguards.js';

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
          && !noindexArticlePaths.has(pathname);
      },
    }),
  ],
  vite: {
    server: {
      allowedHosts: true,
    },
    preview: {
      allowedHosts: true,
    },
  },
});
