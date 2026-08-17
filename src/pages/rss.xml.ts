import rss from '@astrojs/rss';
import latestNews from '../data/latest-news.json';
import archivedNews from '../data/archived-news.json';
import authoredColumns from '../data/authored-columns.json';
import { SITE } from '../config/site';
import { buildRssItems, rssMetadata } from '../../scripts/lib/rss-builder.mjs';
import { buildColumnRssItems } from '../../scripts/lib/column-surface.mjs';

const pubDateMs = (item: { pubDate?: Date | string }) => {
  const stamp = item.pubDate ? new Date(item.pubDate).getTime() : 0;
  return Number.isFinite(stamp) ? stamp : 0;
};

export function GET() {
  const meta = rssMetadata();
  const items = [
    ...buildColumnRssItems(authoredColumns, SITE.url),
    ...buildRssItems([...latestNews, ...archivedNews]),
  ]
    .sort((a, b) => pubDateMs(b) - pubDateMs(a))
    .slice(0, 100);

  return rss({
    ...meta,
    // Renders the feed as a readable page when opened in a browser that
    // supports XSLT; feed readers ignore the stylesheet entirely.
    stylesheet: '/feed.xsl',
    items,
  });
}
