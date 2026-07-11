import latestNews from '../data/latest-news.json';
import archivedNews from '../data/archived-news.json';
import { buildSitemapEntries, sitemapXml } from '../../scripts/lib/sitemap-builder.mjs';

const removedPublicRoutes = new Set([
  '/about/',
  '/editorial-policy/',
  '/methodology/',
  '/ai-disclosure/',
  '/contact/',
]);

export function GET() {
  const entries = buildSitemapEntries([...latestNews, ...archivedNews])
    .filter((entry) => !removedPublicRoutes.has(entry.loc));

  return new Response(
    sitemapXml(entries),
    {
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
      },
    }
  );
}
