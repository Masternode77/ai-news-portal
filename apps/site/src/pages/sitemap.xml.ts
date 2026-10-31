import type { APIRoute } from "astro";
import { allPublications, siteIndexable } from "../lib/repo.ts";
import { buildSitemap, sitemapEntries } from "../lib/feeds.ts";

export const GET: APIRoute = async () => {
  const rows = await allPublications();
  if (rows instanceof Response) return rows;
  // A preview (SITE_INDEXABLE unset) publishes an empty sitemap, matching its robots.txt.
  const xml = buildSitemap(siteIndexable() ? sitemapEntries(rows) : []);
  return new Response(xml, { headers: { "content-type": "application/xml; charset=utf-8" } });
};
