import { test } from "node:test";
import assert from "node:assert/strict";
import { PublicationRow } from "@cc/shared";
import type { PublicationRow as Row } from "@cc/shared";
import { adsTxt, buildRss, buildSitemap, escapeXml, robotsTxt, sitemapEntries, summaryOf } from "../src/lib/feeds.ts";
import { POLICY_PAGES } from "../src/lib/policy-pages.ts";

const row = (over: Partial<Row>): Row =>
  PublicationRow.parse({
    id: "7d7f0d6e-3e7e-4a39-9a2e-1b2c3d4e5f60",
    draft_id: null,
    slug: "news/0123456789abcdef",
    content_type: "news_brief",
    title: "전력 <계통> & 데이터센터",
    body: { summary_ko: "요약 문장입니다." },
    image: null,
    sources: [],
    published_at: "2026-10-30T00:00:00+00:00",
    updated_at: "2026-10-30T01:00:00+00:00",
    publisher: "pipeline",
    status: "published",
    legacy_id: null,
    noindex: false,
    tags: ["power", "grid"],
    category: null,
    region: null,
    ...over,
  });

test("RSS escapes text, links absolute URLs, leaves noindex rows out", () => {
  const xml = buildRss([row({}), row({ slug: "news/fedcba9876543210", noindex: true, title: "숨김" })], {
    title: "Compute Current",
    path: "/rss.xml",
    description: "d",
    language: "ko",
  });
  assert.match(xml, /<title>전력 &lt;계통&gt; &amp; 데이터센터<\/title>/);
  assert.match(xml, /<link>https:\/\/www\.computecurrent\.com\/news\/0123456789abcdef\/<\/link>/);
  assert.match(xml, /<category>power<\/category>/);
  assert.ok(!xml.includes("숨김"), "noindex row is not syndicated");
  assert.match(xml, /<atom:link href="https:\/\/www\.computecurrent\.com\/rss\.xml" rel="self"/);
  assert.equal(escapeXml(`a"b'c`), "a&quot;b&apos;c");
});

test("summaryOf takes the first reader field and trims long text", () => {
  assert.equal(summaryOf(row({ body: { deck: "덱", summary_ko: "요약" } })), "요약");
  assert.equal(summaryOf(row({ body: { article_body: "가".repeat(400) } })).length, 300);
  assert.equal(summaryOf(row({ body: {} })), "");
});

test("sitemap lists policy pages, non-empty taxonomy pages, archive pages and publications; noindex rows stay out", () => {
  const rows = [row({}), row({ slug: "column/a-column-2026-10-01", tags: ["cooling"], content_type: "insight_essay" }), row({ slug: "news/fedcba9876543210", noindex: true, tags: ["hbm"] })];
  const paths = sitemapEntries(rows).map((e) => e.path);
  for (const page of POLICY_PAGES) assert.ok(paths.includes(`/${page.slug}/`));
  for (const path of ["/", "/archive/", "/column/", "/author/josh-inn/", "/category/power-grid/", "/category/cooling/", "/news/0123456789abcdef/", "/column/a-column-2026-10-01/"]) assert.ok(paths.includes(path), path);
  assert.ok(!paths.includes("/category/semiconductors/"), "hbm came only from a noindex row");
  assert.ok(!paths.includes("/news/fedcba9876543210/"));
  assert.ok(!paths.includes("/archive/2/"));
  const xml = buildSitemap(sitemapEntries(rows));
  assert.match(xml, /<loc>https:\/\/www\.computecurrent\.com\/news\/0123456789abcdef\/<\/loc>\n {4}<lastmod>2026-10-30<\/lastmod>/);
});

test("robots.txt: crawlable with a sitemap when indexable, closed otherwise", () => {
  assert.equal(robotsTxt(false), "User-agent: *\nDisallow: /\n");
  assert.match(robotsTxt(true), /Allow: \/\n.*Sitemap: https:\/\/www\.computecurrent\.com\/sitemap\.xml/s);
});

test("ads.txt keeps the legacy two shapes", () => {
  assert.equal(adsTxt("ca-pub-1234567890123456"), "google.com, pub-1234567890123456, DIRECT, f08c47fec0942fa0\n");
  for (const value of [undefined, "", "pub-123", "ca-pub-12"]) assert.match(adsTxt(value), /^# ads\.txt — computecurrent\.com\n# No valid AdSense publisher ID/);
});
