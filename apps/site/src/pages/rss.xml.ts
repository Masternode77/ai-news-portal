import type { APIRoute } from "astro";
import { allPublications } from "../lib/repo.ts";
import { SITE_DESCRIPTION_KO, SITE_NAME, buildRss } from "../lib/feeds.ts";

export const GET: APIRoute = async () => {
  const rows = await allPublications();
  if (rows instanceof Response) return rows;
  const xml = buildRss(rows, { title: SITE_NAME, path: "/rss.xml", description: SITE_DESCRIPTION_KO, language: "ko" });
  return new Response(xml, { headers: { "content-type": "application/rss+xml; charset=utf-8" } });
};
