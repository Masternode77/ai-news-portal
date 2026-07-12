import { publicContentInventory } from '../lib/public-content-inventory.js';
import { buildSitemapEntries, sitemapXml } from '../../scripts/lib/sitemap-builder.mjs';

export function GET() {
  const entries = buildSitemapEntries(publicContentInventory);

  return new Response(
    sitemapXml(entries),
    {
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
      },
    }
  );
}
