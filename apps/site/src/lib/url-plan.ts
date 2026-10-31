/**
 * What the rebuilt site should answer for a path (R8 cutover check,
 * docs/migration/phase5-cutover.md §3). Pure: the route-coverage test runs it
 * over docs/diagnosis/05-preserve-list.csv offline, and tools/verify-urls.ts
 * compares a running deployment against it.
 *
 * Order matches the site: a route answers first; only a 404 consults the
 * redirect rules (src/middleware.ts).
 */
import { findTerm } from "./taxonomy.ts";
import type { TaxonomyKind } from "./taxonomy.ts";
import { policyPage } from "./policy-pages.ts";
import { pathVariants } from "./redirects.ts";
import type { RedirectRule } from "./redirects.ts";

export type Expected =
  | { status: 200 }
  | { status: 301; location: string }
  | { status: 410 }
  /** The archive page exists only while there are enough publications; past the end it redirects. */
  | { status: "200|301"; location: string }
  | { status: 404; reason: string };

export interface UrlPlanContext {
  redirects: readonly RedirectRule[];
  /** Publication slugs (news/…, column/…) expected to be published on the target. */
  publishedSlugs: ReadonlySet<string>;
}

const ENDPOINTS = new Set(["/rss.xml", "/ko/rss.xml", "/sitemap.xml", "/robots.txt", "/ads.txt", "/healthz"]);

function routed(path: string, ctx: UrlPlanContext): Expected | null {
  if (path === "/" || ENDPOINTS.has(path)) return { status: 200 };
  const segments = path.replace(/^\/+|\/+$/g, "").split("/");
  const [first, second, ...rest] = segments;
  if (rest.length > 0 || first === undefined) return null;
  if (second === undefined) {
    if (first === "archive" || first === "column") return { status: 200 };
    return policyPage(first) ? { status: 200 } : null;
  }
  if (first === "archive") {
    if (!/^[1-9][0-9]{0,4}$/.test(second)) return null;
    return second === "1" ? { status: 301, location: "/archive/" } : { status: "200|301", location: "/archive/" };
  }
  if (first === "news" || first === "column") return ctx.publishedSlugs.has(`${first}/${second}`) ? { status: 200 } : null;
  if (first === "category" || first === "region" || first === "company") return findTerm(first as TaxonomyKind, second) ? { status: 200 } : null;
  if (first === "author") return second === "josh-inn" ? { status: 200 } : null;
  return null;
}

export function expectedFor(path: string, ctx: UrlPlanContext): Expected {
  const route = routed(path, ctx);
  if (route) return route;
  const byPath = new Map(ctx.redirects.map((rule) => [rule.from_path, rule]));
  for (const variant of pathVariants(path)) {
    const rule = byPath.get(variant);
    if (rule) return rule.status === 301 ? { status: 301, location: rule.to_path } : { status: 410 };
  }
  return { status: 404, reason: "no route and no redirect rule" };
}

/** Location headers may be absolute; compare by path. */
export function locationPath(location: string | null, base: string): string | null {
  if (location === null) return null;
  try {
    return new URL(location, base).pathname;
  } catch {
    return location;
  }
}

export function matches(expected: Expected, status: number, location: string | null): boolean {
  if (expected.status === "200|301") return status === 200 || (status === 301 && location === expected.location);
  if (expected.status === 301) return status === 301 && location === expected.location;
  return status === expected.status;
}

export function describe(expected: Expected): string {
  if (expected.status === 301) return `301 → ${expected.location}`;
  if (expected.status === "200|301") return `200 or 301 → ${expected.location}`;
  if (expected.status === 404) return `404 (${expected.reason})`;
  return String(expected.status);
}
