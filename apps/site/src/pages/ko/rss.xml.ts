import type { APIRoute } from "astro";
import { allPublications } from "../../lib/repo.ts";
import { SITE_DESCRIPTION_KO, SITE_NAME, buildRss } from "../../lib/feeds.ts";

// The legacy Korean feed; every rebuilt publication is Korean, so it carries the same items as /rss.xml.
export const GET: APIRoute = async () => {
  const rows = await allPublications();
  if (rows instanceof Response) return rows;
  const xml = buildRss(rows, { title: `${SITE_NAME} (한국어)`, path: "/ko/rss.xml", description: SITE_DESCRIPTION_KO, language: "ko" });
  return new Response(xml, { headers: { "content-type": "application/rss+xml; charset=utf-8" } });
};
