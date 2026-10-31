/**
 * Feed and crawler endpoints (ADR-005: /rss.xml, /ko/rss.xml, /sitemap.xml,
 * /robots.txt, /ads.txt from `publications`). Pure string builders; the
 * endpoint files only load rows and set headers. Node-testable.
 */
import type { PublicationRow } from "@cc/shared";
import { POLICY_PAGES } from "./policy-pages.ts";
import { TAXONOMY, matchesTerm, termPath } from "./taxonomy.ts";
import { ARCHIVE_PAGE_SIZE, archivePath, indexableRows, pageCount, publicationPath } from "./listing.ts";

export const SITE_URL = "https://www.computecurrent.com";
export const SITE_NAME = "Compute Current";
export const SITE_DESCRIPTION_KO = "AI 인프라 인텔리전스 — 전력·데이터센터·반도체·클라우드 용량·자본";

export function escapeXml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

export function absoluteUrl(path: string): string {
  return new URL(path, SITE_URL).toString();
}

/** The first non-empty reader-facing text field, for feed descriptions and meta descriptions. */
export function summaryOf(row: Pick<PublicationRow, "body">, maxChars = 300): string {
  for (const key of ["summary_ko", "deck", "thesis_ko", "thesis", "why_it_matters_ko", "article_body", "body_ko"]) {
    const value = row.body[key];
    if (typeof value === "string" && value.trim().length > 0) {
      const text = value.replace(/\s+/g, " ").trim();
      return text.length > maxChars ? `${text.slice(0, maxChars - 1).trimEnd()}…` : text;
    }
  }
  return "";
}

export interface RssOptions {
  title: string;
  path: string;
  description: string;
  language: string;
  limit?: number;
}

export function buildRss(rows: readonly PublicationRow[], options: RssOptions): string {
  const items = indexableRows(rows)
    .slice(0, options.limit ?? 50)
    .map((row) => {
      const link = absoluteUrl(publicationPath(row));
      const categories = [row.category, ...row.tags].filter((v): v is string => Boolean(v)).map((v) => `      <category>${escapeXml(v)}</category>`);
      return [
        "    <item>",
        `      <title>${escapeXml(row.title)}</title>`,
        `      <link>${escapeXml(link)}</link>`,
        `      <guid isPermaLink="true">${escapeXml(link)}</guid>`,
        `      <pubDate>${new Date(row.published_at).toUTCString()}</pubDate>`,
        `      <description>${escapeXml(summaryOf(row))}</description>`,
        ...categories,
        "    </item>",
      ].join("\n");
    });
  const lastBuild = rows[0] ? new Date(rows[0].published_at).toUTCString() : new Date(0).toUTCString();
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    "  <channel>",
    `    <title>${escapeXml(options.title)}</title>`,
    `    <link>${SITE_URL}/</link>`,
    `    <atom:link href="${escapeXml(absoluteUrl(options.path))}" rel="self" type="application/rss+xml" />`,
    `    <description>${escapeXml(options.description)}</description>`,
    `    <language>${escapeXml(options.language)}</language>`,
    `    <lastBuildDate>${lastBuild}</lastBuildDate>`,
    ...items,
    "  </channel>",
    "</rss>",
    "",
  ].join("\n");
}

export interface SitemapEntry {
  path: string;
  lastmod?: string;
}

/**
 * Every indexable URL the site answers 200 for: publications, listing pages
 * that have rows, taxonomy pages with at least one row, the author page and
 * the policy pages. Redirected and gone URLs are left out.
 */
export function sitemapEntries(rows: readonly PublicationRow[]): SitemapEntry[] {
  const indexable = indexableRows(rows);
  const latest = indexable[0]?.updated_at;
  const entries: SitemapEntry[] = [{ path: "/", ...(latest ? { lastmod: latest } : {}) }];
  const pages = pageCount(indexable.length, ARCHIVE_PAGE_SIZE);
  for (let page = 1; page <= pages; page += 1) entries.push({ path: archivePath(page) });
  if (indexable.some((row) => row.slug.startsWith("column/"))) entries.push({ path: "/column/" });
  entries.push({ path: "/author/josh-inn/" });
  for (const term of TAXONOMY) {
    if (indexable.some((row) => matchesTerm(row, term))) entries.push({ path: termPath(term) });
  }
  for (const page of POLICY_PAGES) entries.push({ path: `/${page.slug}/` });
  for (const row of indexable) entries.push({ path: publicationPath(row), lastmod: row.updated_at });
  return entries;
}

export function buildSitemap(entries: readonly SitemapEntry[]): string {
  const urls = entries.map((entry) =>
    [
      "  <url>",
      `    <loc>${escapeXml(absoluteUrl(entry.path))}</loc>`,
      ...(entry.lastmod ? [`    <lastmod>${escapeXml(entry.lastmod.slice(0, 10))}</lastmod>`] : []),
      "  </url>",
    ].join("\n"),
  );
  return ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">', ...urls, "</urlset>", ""].join("\n");
}

/** Indexable deployments allow crawling and point at the sitemap; previews disallow everything. */
export function robotsTxt(indexable: boolean): string {
  if (!indexable) return ["User-agent: *", "Disallow: /", ""].join("\n");
  return ["User-agent: *", "Allow: /", "Disallow: /healthz", "", `Sitemap: ${SITE_URL}/sitemap.xml`, ""].join("\n");
}

const ADSENSE_CLIENT = /^ca-pub-\d{10,20}$/;

/**
 * The legacy endpoint's two shapes (src/pages/ads.txt.ts): the authorized
 * seller record when PUBLIC_ADSENSE_CLIENT holds a ca-pub identifier, a
 * comment explaining its absence otherwise.
 */
export function adsTxt(adsenseClient: string | undefined): string {
  const client = adsenseClient?.trim() ?? "";
  if (ADSENSE_CLIENT.test(client)) return `google.com, ${client.replace(/^ca-/, "")}, DIRECT, f08c47fec0942fa0\n`;
  return [
    "# ads.txt — computecurrent.com",
    "# No valid AdSense publisher ID is configured for this deployment.",
    "# Set PUBLIC_ADSENSE_CLIENT to the account-issued ca-pub identifier",
    "# to publish the corresponding authorized-seller record.",
    "",
  ].join("\n");
}
