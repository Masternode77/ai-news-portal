import reference from '../data/infrastructure-reference.json';
import latestNews from '../data/latest-news.json';
import archivedNews from '../data/archived-news.json';
import authoredColumns from '../data/authored-columns.json';
import taxonomyPages from '../data/taxonomy-pages.json';
import industryHeadlines from '../data/industry-headlines.json';
import { SITE } from '../config/site';
import { buildSitemapEntries, sitemapXml } from '../../scripts/lib/sitemap-builder.mjs';
import { buildColumnSitemapEntries } from '../../scripts/lib/column-surface.mjs';
import { buildHomepageFeed } from '../../scripts/lib/homepage-feed-builder.mjs';
import { eligibleHeadlineSourceIds, headlinesFor } from '../../scripts/lib/industry-headlines-view.mjs';
import { loadSourceRegistrySync } from '../../scripts/lib/source-registry.mjs';

const now = new Date();
const headlineSourceIds = eligibleHeadlineSourceIds(loadSourceRegistrySync(), now);
const activeCompanySlugs = (taxonomyPages.companies || [])
  .filter((page) => buildHomepageFeed(page.items || [], { limit: 1, minimumVisible: 0 }).items.length > 0
    || headlinesFor(industryHeadlines, { language: 'en', limit: 1, company: page.name, sourceIds: headlineSourceIds, now }).length > 0)
  .map((page) => page.slug);

export function GET() {
  const entries = [
    ...['/radar/', '/data/', '/data/demand/', '/data/capacity/', '/data/ercot/', '/ko/', '/hubs/', '/entities/', '/glossary/', '/newsletter/', ...reference.hubs.map(row => `/hubs/${row.slug}/`), ...reference.entities.map(row => `/entities/${row.slug}/`)].map(loc => ({loc})),
    ...buildSitemapEntries([...latestNews, ...archivedNews], { columns: authoredColumns, activeCompanySlugs }),
    ...buildColumnSitemapEntries(authoredColumns, SITE.url),
  ];
  return new Response(
    sitemapXml(entries),
    {
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
      },
    }
  );
}
