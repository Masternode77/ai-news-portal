import type { APIRoute } from "astro";
import { siteIndexable } from "../lib/repo.ts";
import { robotsTxt } from "../lib/feeds.ts";

export const GET: APIRoute = () =>
  new Response(robotsTxt(siteIndexable()), { headers: { "content-type": "text/plain; charset=utf-8" } });
