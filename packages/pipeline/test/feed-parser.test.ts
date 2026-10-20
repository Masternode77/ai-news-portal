import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseFeed } from "../src/adapters/source/feed-parser.ts";
import { FIXTURES_DIR } from "./helpers.ts";

test("parses the RSS 2.0 sample fixture", async () => {
  const feed = parseFeed(await readFile(join(FIXTURES_DIR, "rss", "sample.xml"), "utf8"));
  assert.equal(feed.kind, "rss");
  assert.equal(feed.items.length, 30);
  assert.equal(feed.language, "en");
  const first = feed.items[0]!;
  assert.equal(first.title, "Google Cloud AI: Anthropic's Claude Haiku 5.5");
  assert.equal(first.link, "https://docs.cloud.google.com/gemini-enterprise-agent-platform/release-notes#October_07_2026");
  assert.equal(first.guid, "577caf2e55b46c65");
  assert.deepEqual(first.dates, ["Wed, 07 Oct 2026 07:00:00 GMT"]);
  assert.ok(first.contentHtml.startsWith("Feature Anthropic"));
  assert.deepEqual(first.categories, ["AI Infrastructure"]);
});

test("parses RSS edge cases: markup in titles, escaped HTML, content:encoded, images, guid-only links, dc:date", () => {
  const xml = `<?xml version="1.0"?><rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:media="http://search.yahoo.com/mrss/">
  <channel><title>T</title><language>ko-KR</language>
    <item>
      <title>&lt;a href="https://acer.europa.eu/x"&gt;ACER publishes &amp;amp; report&lt;/a&gt;</title>
      <link>https://acer.europa.eu/x?utm_source=rss</link>
      <description>&lt;p&gt;Escaped &lt;b&gt;summary&lt;/b&gt;&lt;/p&gt;</description>
      <content:encoded><![CDATA[<p>Full <i>body</i></p><img src="https://img.test/a.png">]]></content:encoded>
      <dc:date>2026-10-07T07:00:00Z</dc:date>
      <media:content url="https://img.test/m.jpg" medium="image"/>
      <category><![CDATA[Power]]></category><category>Grid</category>
    </item>
    <item>
      <title>Guid only</title>
      <guid isPermaLink="true">https://h.test/guid-only</guid>
      <pubDate>Tue, 10/07/2026 - 09:30</pubDate>
      <enclosure url="https://img.test/e.jpg" type="image/jpeg" length="1"/>
    </item>
    <item><description>no title no link</description></item>
  </channel></rss>`;
  const feed = parseFeed(xml);
  assert.equal(feed.items.length, 2);
  assert.equal(feed.language, "ko");
  const [a, b] = feed.items;
  assert.equal(a!.title, "ACER publishes & report");
  assert.equal(a!.link, "https://acer.europa.eu/x?utm_source=rss");
  assert.equal(a!.summaryHtml, "<p>Escaped <b>summary</b></p>");
  assert.equal(a!.contentHtml, '<p>Full <i>body</i></p><img src="https://img.test/a.png">');
  assert.deepEqual(a!.dates, ["2026-10-07T07:00:00Z"]);
  assert.equal(a!.image, "https://img.test/m.jpg");
  assert.deepEqual(a!.categories, ["Power", "Grid"]);
  assert.equal(b!.link, null, "RSS guid is not a link; the adapter decides whether to use it");
  assert.equal(b!.guid, "https://h.test/guid-only");
  assert.deepEqual(b!.dates, ["Tue, 10/07/2026 - 09:30"]);
  assert.equal(b!.image, "https://img.test/e.jpg");
});

test("parses Atom 1.0 entries with rel=alternate links and type=html content", () => {
  const xml = `<?xml version="1.0" encoding="utf-8"?><feed xmlns="http://www.w3.org/2005/Atom" xml:lang="en-US">
    <title>Atom feed</title><link rel="self" href="https://h.test/feed.atom"/>
    <entry>
      <title type="html">Title &amp; more</title>
      <link rel="self" href="https://h.test/entries/1.atom"/>
      <link rel="alternate" type="text/html" href="https://h.test/posts/1"/>
      <id>urn:uuid:1</id>
      <published>2026-10-07T07:00:00Z</published><updated>2026-10-08T07:00:00Z</updated>
      <summary type="html">&lt;p&gt;Sum&lt;/p&gt;</summary>
      <content type="html"><![CDATA[<p>Body</p>]]></content>
      <category term="hpc"/>
    </entry>
    <entry><title>Plain link</title><link href="https://h.test/posts/2"/><id>urn:uuid:2</id><updated>2026-10-01T00:00:00Z</updated></entry>
  </feed>`;
  const feed = parseFeed(xml);
  assert.equal(feed.kind, "atom");
  assert.equal(feed.language, "en");
  assert.equal(feed.items.length, 2);
  const [a, b] = feed.items;
  assert.equal(a!.title, "Title & more");
  assert.equal(a!.link, "https://h.test/posts/1");
  assert.equal(a!.guid, "urn:uuid:1");
  assert.deepEqual(a!.dates, ["2026-10-07T07:00:00Z", "2026-10-08T07:00:00Z"]);
  assert.equal(a!.contentHtml, "<p>Body</p>");
  assert.equal(a!.summaryHtml, "<p>Sum</p>");
  assert.deepEqual(a!.categories, ["hpc"]);
  assert.equal(b!.link, "https://h.test/posts/2");
});

test("garbage input yields no items instead of throwing", () => {
  assert.deepEqual(parseFeed("<html><body>not a feed</body></html>").items, []);
  assert.deepEqual(parseFeed("").items, []);
});

test("only an enclosure with an image MIME type is the item image; audio, video and untyped enclosures fall through", async () => {
  const { parseFeed } = await import("../src/adapters/index.ts");
  const feed = `<?xml version="1.0"?><rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/"><channel><title>T</title>
    <item><title>Podcast episode with thumbnail</title><link>https://a.test/1</link>
      <enclosure url="https://a.test/ep1.mp3" type="audio/mpeg" length="1"/>
      <media:thumbnail url="https://img.test/t1.jpg"/></item>
    <item><title>Untyped enclosure, media content image</title><link>https://a.test/2</link>
      <enclosure url="https://a.test/download.bin" length="1"/>
      <media:content url="https://img.test/m2.jpg" medium="image"/></item>
    <item><title>Untyped enclosure only</title><link>https://a.test/3</link>
      <enclosure url="https://a.test/file" length="1"/></item>
    <item><title>Image enclosure wins</title><link>https://a.test/4</link>
      <enclosure url="https://img.test/e4.png" type="image/png" length="1"/>
      <media:thumbnail url="https://img.test/t4.jpg"/></item>
  </channel></rss>`;
  const items = parseFeed(feed).items;
  assert.deepEqual(items.map((i) => i.image), ["https://img.test/t1.jpg", "https://img.test/m2.jpg", null, "https://img.test/e4.png"]);
});

test("media:content counts as an image only when it says so; the content HTML <img> is the last fallback", async () => {
  const { parseFeed } = await import("../src/adapters/index.ts");
  const feed = `<?xml version="1.0"?><rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/" xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel><title>T</title>
    <item><title>Audio media content without medium, thumbnail present</title><link>https://a.test/1</link>
      <media:content url="https://a.test/ep1.mp3" type="audio/mpeg"/>
      <media:thumbnail url="https://img.test/t1.jpg"/></item>
    <item><title>Video medium</title><link>https://a.test/2</link>
      <media:content url="https://a.test/clip.mp4" medium="video"/>
      <content:encoded><![CDATA[<p>Story</p><img src="https://img.test/inline2.jpg" alt=""><p>More</p>]]></content:encoded></item>
    <item><title>Untyped media content with an image url</title><link>https://a.test/3</link>
      <media:content url="https://img.test/m3.jpeg?w=800"/></item>
    <item><title>Untyped media content with a non-image url</title><link>https://a.test/4</link>
      <media:content url="https://a.test/attachment"/></item>
    <item><title>Escaped description image</title><link>https://a.test/5</link>
      <description>&lt;p&gt;Text&lt;/p&gt;&lt;img src="https://img.test/desc5.png"&gt;</description></item>
    <item><title>Nothing</title><link>https://a.test/6</link><description>plain</description></item>
  </channel></rss>`;
  const items = parseFeed(feed).items;
  assert.deepEqual(items.map((i) => i.image), ["https://img.test/t1.jpg", "https://img.test/inline2.jpg", "https://img.test/m3.jpeg?w=800", null, "https://img.test/desc5.png", null]);
});
