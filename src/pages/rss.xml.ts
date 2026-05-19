import rss from '@astrojs/rss';
import latestNews from '../data/latest-news.json';
import archivedNews from '../data/archived-news.json';
import { SITE } from '../config/site';
import { cleanEditorialText, displayHeadline } from '../lib/editorial-display.js';
import { rssItemEligible } from '../../scripts/lib/sitemap-quality-filter.mjs';
import { routePublicLane } from '../../scripts/lib/public-lane-router.mjs';
import { buildPublicPresentation } from '../../scripts/lib/public-presentation.mjs';

export function GET() {
  const items = [...latestNews, ...archivedNews]
    .filter((item) => item?.id && item?.publishedAt)
    .map((item) => ({ item, route: routePublicLane(item) }))
    .filter(({ item, route }) => rssItemEligible(item, { route }))
    .sort((a, b) => new Date(b.item.publishedAt).getTime() - new Date(a.item.publishedAt).getTime())
    .slice(0, 100)
    .map(({ item, route }) => {
      const presentation = buildPublicPresentation(item, { route });
      const link = item.articlePagePublished === false || route.visibility !== 'core'
        ? item.sourceUrl || item.url
        : `/news/${item.id}/`;
      return {
        title: displayHeadline(item),
        pubDate: new Date(item.publishedAt),
        description: cleanEditorialText(presentation.deck || presentation.why_it_matters || ''),
        link,
      };
    });

  return rss({
    title: SITE.name,
    description: SITE.tagline,
    site: SITE.url,
    items,
  });
}
