/**
 * Site-wide middleware:
 *   1. a route that answered 404 is checked against the redirect rules
 *      (legacy URLs → 301 or 410, R8); every other response passes through;
 *   2. the security headers the legacy vercel.json set on every path are
 *      added, because the root vercel.json does not apply once the project's
 *      Root Directory is apps/site.
 */
import { defineMiddleware } from "astro:middleware";
import { siteRedirects } from "./lib/repo.ts";
import { redirectResponse } from "./lib/redirects.ts";

export const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "x-frame-options": "SAMEORIGIN",
  "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
};

function withSecurityHeaders(response: Response): Response {
  // Some responses (redirects built by the runtime) carry immutable headers; copy them into a new Response then.
  try {
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) response.headers.set(name, value);
    return response;
  } catch {
    const headers = new Headers(response.headers);
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) headers.set(name, value);
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  }
}

export const onRequest = defineMiddleware(async (context, next) => {
  const response = await next();
  if (response.status !== 404) return withSecurityHeaders(response);
  const rule = await siteRedirects().lookup(context.url.pathname);
  return withSecurityHeaders(rule ? redirectResponse(rule) : response);
});
