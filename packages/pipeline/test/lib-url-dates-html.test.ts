import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanItemUrl, googleReleaseNoteTarget, hostAllowed, pathWithinPrefix, repairFeedLink } from "../src/lib/url.ts";
import { isFutureDate, namesImpossibleDay, olderThanDays, parsePublishedAt } from "../src/lib/dates.ts";
import { cleanText, decodeEntities, pageCarriesMarker, paragraphs, removeNonContentBlocks, truncateAtSentence, unwrapCdata } from "../src/lib/html.ts";

const NOW = new Date("2026-10-18T00:45:00Z");

test("cleanItemUrl strips tracking params and fragments, upgrades http, rejects unsafe values", () => {
  assert.equal(cleanItemUrl("http://Example.com/a?utm_source=x&id=1#top"), "https://example.com/a?id=1");
  assert.equal(cleanItemUrl("https://a.test/p?ref=rss&fbclid=1&gclid=2&mc_cid=3&mc_eid=4&utm_id=5"), "https://a.test/p");
  assert.equal(cleanItemUrl("https://a.test/p#keep", { keepFragment: true }), "https://a.test/p#keep");
  assert.equal(cleanItemUrl("http://a.test/p", { upgradeHttp: false }), "http://a.test/p");
  assert.equal(cleanItemUrl("javascript:alert(1)"), null);
  assert.equal(cleanItemUrl("https://user:pw@a.test/p"), null);
  assert.equal(cleanItemUrl("https://a.test/p\u0000"), null);
  assert.equal(cleanItemUrl("not a url"), null);
  assert.equal(cleanItemUrl(null), null);
});

test("Google Cloud release-note URLs keep their dated fragment", () => {
  const url = "https://docs.cloud.google.com/gemini-enterprise-agent-platform/release-notes#October_07_2026";
  assert.deepEqual(googleReleaseNoteTarget(url), { product: "Google Cloud AI", anchor: "October_07_2026" });
  assert.equal(cleanItemUrl(url), url);
  assert.equal(googleReleaseNoteTarget("https://docs.cloud.google.com/tpu/docs/release-notes"), null);
  assert.equal(googleReleaseNoteTarget("https://docs.cloud.google.com/other/release-notes#October_07_2026"), null);
});

test("repairFeedLink recovers Drupal escaped anchors", () => {
  assert.equal(repairFeedLink("https://host/%3Ca%20href%3D%22/news/slug%22%3Ex%3C/a%3E", "https://host/feed"), "https://host/news/slug");
  assert.equal(repairFeedLink("https://host/plain", "https://host/feed"), "https://host/plain");
  assert.equal(repairFeedLink("  ", "https://host/feed"), "");
});

test("host and path allowlists", () => {
  assert.equal(hostAllowed("WWW.Example.com.", ["www.example.com"]), true);
  assert.equal(hostAllowed("a.example.com", ["*.example.com"]), true);
  assert.equal(hostAllowed("example.com", ["*.example.com"]), false);
  assert.equal(hostAllowed("evil.com", ["example.com"]), false);
  assert.equal(pathWithinPrefix(new URL("https://h.test/news/my-post/"), "/news/"), true);
  assert.equal(pathWithinPrefix(new URL("https://h.test/news/a/b"), "/news/"), false);
  assert.equal(pathWithinPrefix(new URL("https://h.test/news/my-post?x=1"), "/news/"), false);
  assert.equal(pathWithinPrefix(new URL("https://h.test/news/my-post"), "news/"), false);
});

test("parsePublishedAt handles ISO, RFC 822, Drupal, month names, missing, unparseable and future dates", () => {
  assert.deepEqual(parsePublishedAt(["2026-10-07T07:00:00.000Z"], NOW), { iso: "2026-10-07T07:00:00.000Z", problem: null });
  assert.deepEqual(parsePublishedAt(["Wed, 07 Oct 2026 07:00:00 GMT"], NOW), { iso: "2026-10-07T07:00:00.000Z", problem: null });
  assert.deepEqual(parsePublishedAt(["Tue, 10/07/2026 - 09:30"], NOW), { iso: "2026-10-07T09:30:00.000Z", problem: null });
  assert.deepEqual(parsePublishedAt(["Oct 7, 2026"], NOW), { iso: "2026-10-07T12:00:00.000Z", problem: null });
  assert.deepEqual(parsePublishedAt([], NOW), { iso: null, problem: "missing" });
  assert.deepEqual(parsePublishedAt(["not a date"], NOW), { iso: null, problem: "unparseable" });
  assert.deepEqual(parsePublishedAt(["garbage", "2026-10-01T00:00:00Z"], NOW), { iso: "2026-10-01T00:00:00.000Z", problem: null });
  assert.equal(parsePublishedAt(["2026-10-20T00:00:00Z"], NOW).problem, "future");
  assert.equal(parsePublishedAt(["2026-10-18T20:00:00Z"], NOW).problem, null, "within the one-day tolerance");
  // A day that does not exist in its month is unparseable, never rolled into the next month (the Date constructor would give Mar 3).
  for (const impossible of ["Feb 31, 2026", "Wed, 31 Feb 2026 07:00:00 GMT", "2026-02-31T00:00:00Z", "2026-02-31", "Tue, 02/31/2026 - 09:30", "Feb 29, 2026", "Apr 31, 2026 10:00:00 +0900", "31 February 2026"]) {
    assert.deepEqual(parsePublishedAt([impossible], NOW), { iso: null, problem: "unparseable" }, impossible);
  }
  assert.equal(namesImpossibleDay("Feb 31, 2026"), true);
  assert.equal(parsePublishedAt(["Feb 29, 2024"], NOW).iso, "2024-02-29T12:00:00.000Z", "a leap day exists");
  assert.equal(parsePublishedAt(["Sat, 31 Jan 2026 23:30:00 -0500"], NOW).iso, "2026-02-01T04:30:00.000Z", "a real day that crosses midnight in UTC is still a real day");
  assert.equal(olderThanDays("2026-10-01T00:00:00Z", 10, NOW), true);
  assert.equal(olderThanDays("2026-10-15T00:00:00Z", 10, NOW), false);
});

test("html helpers", () => {
  assert.equal(decodeEntities("A &amp; B &lt;p&gt; &#8217;x&#x27; &nbsp;&rsquo;&unknown;"), "A & B <p> ’x'  ’&unknown;");
  assert.deepEqual(unwrapCdata("<![CDATA[<b>x</b>]]>"), { text: "<b>x</b>", wasCdata: true });
  assert.equal(cleanText("<p>Hello&nbsp;<b>world</b></p><script>bad()</script>"), "Hello world");
  const html = `<nav>Menu</nav><article><p>${"x".repeat(70)}</p><p>short</p><p>Please subscribe to our newsletter today for more ${"y".repeat(40)}</p></article><footer>f</footer>`;
  assert.equal(removeNonContentBlocks(html).includes("Menu"), false);
  assert.deepEqual(paragraphs(html), ["x".repeat(70)]);
  const long = `${"Sentence one. ".repeat(60)}Tail without end`;
  const cut = truncateAtSentence(long, 700);
  assert.ok(cut.length <= 700 && cut.endsWith("."));
  assert.ok(truncateAtSentence("a".repeat(900), 600).endsWith("…"));
  assert.equal(pageCarriesMarker("<p>Distributed under <a>CC BY 4.0</a></p><script>CC BY 4.0</script>", "Distributed under CC BY 4.0"), true);
  assert.equal(pageCarriesMarker("<script>Distributed under CC BY 4.0</script>", "Distributed under CC BY 4.0"), false);
});

test("isFutureDate tolerates one day of clock skew and matches the feed path's rule", () => {
  assert.equal(isFutureDate("2026-10-18T20:00:00Z", NOW), false, "later today is not future");
  assert.equal(isFutureDate("2026-10-19T00:44:00Z", NOW), false, "just under a day ahead is tolerated");
  assert.equal(isFutureDate("2026-10-19T00:46:00Z", NOW), true, "more than a day ahead is malformed metadata");
  assert.equal(parsePublishedAt(["2026-10-19T00:46:00Z"], NOW).problem, "future");
});
