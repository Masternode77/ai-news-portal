import rss from '@astrojs/rss';
import { publicContentInventory } from '../lib/public-content-inventory.js';
import { buildRssItems, rssMetadata } from '../../scripts/lib/rss-builder.mjs';

const removedPublicRoutes = new Set([
  '/about/',
  '/editorial-policy/',
  '/methodology/',
  '/ai-disclosure/',
  '/contact/',
]);

function pointsToRemovedRoute(link: string, site: string) {
  try {
    return removedPublicRoutes.has(new URL(link, site).pathname);
  } catch {
    return false;
  }
}

export function GET() {
  const meta = rssMetadata();
  const items = buildRssItems(publicContentInventory)
    .filter((item) => !pointsToRemovedRoute(item.link, meta.site));

  return rss({
    ...meta,
    items,
  });
}
