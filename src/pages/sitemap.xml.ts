import latestNews from '../data/latest-news.json';
import archivedNews from '../data/archived-news.json';
import authoredColumns from '../data/authored-columns.json';
import { SITE } from '../config/site';
import { buildSitemapEntries, sitemapXml } from '../../scripts/lib/sitemap-builder.mjs';
import { buildColumnSitemapEntries } from '../../scripts/lib/column-surface.mjs';

export function GET() {
  const entries = [
    ...buildSitemapEntries([...latestNews, ...archivedNews]),
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
