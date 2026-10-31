import type { APIRoute } from "astro";
import { adsTxt } from "../lib/feeds.ts";

// PUBLIC_ADSENSE_CLIENT is read at request time (name only; its value is a public publisher ID).
export const GET: APIRoute = () =>
  new Response(adsTxt(process.env["PUBLIC_ADSENSE_CLIENT"]), { headers: { "content-type": "text/plain; charset=utf-8" } });
