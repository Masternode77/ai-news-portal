import rss from '@astrojs/rss';
import latestNews from '../data/latest-news.json';
import archivedNews from '../data/archived-news.json';
import { buildRssItems, rssMetadata } from '../../scripts/lib/rss-builder.mjs';

export function GET() {
  const meta = rssMetadata();

  return rss({
    ...meta,
    // Renders the feed as a readable page when opened in a browser that
    // supports XSLT; feed readers ignore the stylesheet entirely.
    stylesheet: '/feed.xsl',
    items: buildRssItems([...latestNews, ...archivedNews]),
  });
}
