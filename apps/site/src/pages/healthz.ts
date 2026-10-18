import type { APIRoute } from "astro";
import { siteRepo } from "../lib/repo.ts";

export const prerender = false;

export const GET: APIRoute = async () => {
  const health = await siteRepo().health();
  return new Response(JSON.stringify({ ...health, checkedAt: new Date().toISOString() }), {
    status: health.ok ? 200 : 503,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
};
