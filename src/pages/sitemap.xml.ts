import latestNews from '../data/latest-news.json';
import archivedNews from '../data/archived-news.json';
import { buildSitemapEntries, sitemapXml } from '../../scripts/lib/sitemap-builder.mjs';

export function GET() {
  return new Response(
    sitemapXml(buildSitemapEntries([...latestNews, ...archivedNews])),
    {
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
      },
    }
  );
}
