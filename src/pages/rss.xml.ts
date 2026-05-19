import rss from '@astrojs/rss';
import latestNews from '../data/latest-news.json';
import archivedNews from '../data/archived-news.json';
import { SITE } from '../config/site';
import { cleanEditorialText, displayHeadline } from '../lib/editorial-display.js';
import { rssItemEligible } from '../../scripts/lib/seo-quality-policy.mjs';

export function GET() {
  const items = [...latestNews, ...archivedNews]
    .filter((item) => item?.id && item?.publishedAt && rssItemEligible(item))
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
    .slice(0, 100)
    .map((item) => ({
      title: displayHeadline(item),
      pubDate: new Date(item.publishedAt),
      description: cleanEditorialText(item.expertLensShort || item.summary || item.snippet || ''),
      link: item.articlePagePublished === false ? item.sourceUrl || item.url || '/' : `/news/${item.id}/`,
    }));

  return rss({
    title: SITE.name,
    description: SITE.tagline,
    site: SITE.url,
    items,
  });
}
