import type { APIRoute } from "astro";
import { allPublications } from "../../lib/repo.ts";
import { SITE_DESCRIPTION, SITE_NAME, buildRss } from "../../lib/feeds.ts";

// The legacy Korean feed URL stays a preserved 200 (docs/migration/phase5-cutover.md §3). Every article is
// English since ADR-009 (2026-11-04), so it carries the same items as /rss.xml and says so in its description.
export const GET: APIRoute = async () => {
  const rows = await allPublications();
  if (rows instanceof Response) return rows;
  const xml = buildRss(rows, { title: SITE_NAME, path: "/ko/rss.xml", description: `${SITE_DESCRIPTION} Formerly the Korean feed; every article is now published in English.`, language: "en" });
  return new Response(xml, { headers: { "content-type": "application/rss+xml; charset=utf-8" } });
};
