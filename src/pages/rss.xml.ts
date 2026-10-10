import rss from '@astrojs/rss';
import latestNews from '../data/latest-news.json';
import archivedNews from '../data/archived-news.json';
import authoredColumns from '../data/authored-columns.json';
import { SITE } from '../config/site';
import { buildUnifiedRssItems, rssMetadata } from '../../scripts/lib/rss-builder.mjs';

export function GET() {
  const meta = rssMetadata();
  const items = buildUnifiedRssItems({
    articles: [...latestNews, ...archivedNews],
    columns: authoredColumns,
  }, { site: SITE.url });

  return rss({
    ...meta,
    // Renders the feed as a readable page when opened in a browser that
    // supports XSLT; feed readers ignore the stylesheet entirely.
    stylesheet: '/feed.xsl',
    items,
  });
}
