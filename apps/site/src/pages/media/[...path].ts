import type { APIRoute } from "astro";
import { MEDIA_CACHE_CONTROL, mediaUpstream } from "../../lib/media.ts";

export const prerender = false;

/** Serves generated essay images from the Supabase Storage bucket on the site's own domain (src/lib/media.ts). */
export const GET: APIRoute = async ({ params }) => {
  const upstream = mediaUpstream(params.path, {
    SITE_DATA_SOURCE: process.env["SITE_DATA_SOURCE"],
    SUPABASE_URL: process.env["SUPABASE_URL"],
    MEDIA_BUCKET: process.env["MEDIA_BUCKET"],
  });
  if (!upstream) return new Response("Not found", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
  let response: Response;
  try {
    response = await fetch(upstream.url);
  } catch {
    return new Response("Bad gateway", { status: 502, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
  }
  if (!response.ok || !response.body) {
    return new Response("Not found", { status: 404, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
  }
  return new Response(response.body, { status: 200, headers: { "content-type": upstream.contentType, "cache-control": MEDIA_CACHE_CONTROL } });
};
