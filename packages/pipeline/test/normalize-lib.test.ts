/** Phase 3b building blocks: URL identity, title keys and similarity, body shingles, deterministic raw item ids. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { rawItemId } from "@cc/shared";
import { bodySimilarity, dice, jaccard, shingles, textTokens, titleKey, titleSimilarity, titleTokenList, titleTokens } from "../src/lib/similarity.ts";
import { urlIdentityKey } from "../src/lib/url.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

test("urlIdentityKey collapses www/m/amp hosts, trailing slashes, index.html, AMP suffixes, tracking and parameter order", () => {
  const key = "wire-a.example.com/news/microsoft-busan-1-2gw";
  for (const variant of [
    "https://www.wire-a.example.com/news/microsoft-busan-1-2gw?utm_source=rss&utm_medium=feed",
    "https://wire-a.example.com/news/microsoft-busan-1-2gw/",
    "http://m.wire-a.example.com/news/microsoft-busan-1-2gw/index.html",
    "https://amp.wire-a.example.com/news/microsoft-busan-1-2gw/amp/",
    "https://WIRE-A.example.com/news/microsoft-busan-1-2gw?outputType=amp&fbclid=abc#comments",
  ]) assert.equal(urlIdentityKey(variant), key, variant);
  assert.equal(urlIdentityKey("https://a.test/p?b=2&a=1&utm_id=9"), "a.test/p?a=1&b=2", "query sorted, tracking removed");
  assert.equal(urlIdentityKey("https://a.test/p?a=1"), "a.test/p?a=1");
  assert.notEqual(urlIdentityKey("https://a.test/p?id=1"), urlIdentityKey("https://a.test/p?id=2"), "meaningful parameters stay");
  assert.equal(
    urlIdentityKey("https://docs.cloud.google.com/tpu/docs/release-notes#October_07_2026"),
    "docs.cloud.google.com/tpu/docs/release-notes#October_07_2026",
    "the dated Google release-note anchor is part of the identity",
  );
  assert.equal(urlIdentityKey("https://a.test/"), "a.test");
  assert.equal(urlIdentityKey("javascript:alert(1)"), null);
  assert.equal(urlIdentityKey("not a url"), null);
});

test("title keys drop punctuation and function words; Hangul contributes character bigrams", () => {
  assert.equal(titleKey("NVIDIA, SK hynix expand HBM4 supply deal — report"), titleKey("Nvidia and SK Hynix expand HBM4 supply deal: report"));
  assert.deepEqual(titleTokenList("The grid is ready for AI"), ["grid", "ready", "ai"]);
  assert.deepEqual(titleTokenList("삼성SDS 구미에 AI 데이터센터 건립"), ["삼성", "sds", "구미", "미에", "ai", "데이", "이터", "터센", "센터", "건립"]);
  assert.ok(titleSimilarity("삼성SDS, 구미 AI 데이터센터 건립", "삼성SDS 구미에 AI 데이터센터 건립한다") > 0.7, "particles do not break Korean matches");
  assert.equal(titleKey("—"), "");
  assert.equal(dice(new Set(), new Set(["a"])), 0);
});

test("titleSimilarity separates the same story from a different one about the same company", () => {
  const a = "Microsoft signs 1.2 GW capacity agreement with Example Data Centers in Busan";
  const same = "Microsoft signs 1.2 GW capacity agreement with Example Data Centers in Busan, sources say";
  const other = "Microsoft opens a new Azure region in Busan with Example Data Centers";
  assert.ok(titleSimilarity(a, same) >= 0.85, String(titleSimilarity(a, same)));
  assert.ok(titleSimilarity(a, other) < 0.85, String(titleSimilarity(a, other)));
  assert.ok(titleSimilarity("Google Cloud AI: Claude Haiku 5.5 is available", "Google Cloud AI: Gemini 3 Pro is available") < 0.85, "release-note items sharing a product prefix stay distinct");
  assert.equal(titleSimilarity(a, a), 1);
  assert.deepEqual([...titleTokens("A to the B")], []);
});

test("body shingles and jaccard: identical press releases match, a rewrite does not, short texts never match", () => {
  const release = "Example Data Centers today announced a 300 MW hyperscale campus in Incheon, with the first 60 MW phase scheduled to reach ready-for-service in the fourth quarter of 2028. The company said the site has secured a grid connection agreement with the utility.";
  const edited = `${release} Construction financing is being arranged with a consortium of lenders.`;
  const rewrite = "A 300 MW campus in Incheon was announced by Example Data Centers; the first phase of 60 MW is due in late 2028 and the utility has agreed to connect the site.";
  assert.equal(bodySimilarity(release, release), 1);
  assert.ok(bodySimilarity(release, edited) >= 0.6, String(bodySimilarity(release, edited)));
  assert.ok(bodySimilarity(release, rewrite) < 0.6, String(bodySimilarity(release, rewrite)));
  assert.equal(shingles(textTokens("one two three"), 5).size, 0, "shorter than n yields no shingles");
  assert.equal(jaccard(new Set(), new Set(["x"])), 0);
  assert.equal(jaccard(new Set(["a b", "b c"]), new Set(["b c", "c d"])), 1 / 3);
});

test("rawItemId is a deterministic v5-shaped uuid of the canonical url", () => {
  const id = rawItemId("https://www.eia.gov/todayinenergy/detail.php?id=67344");
  assert.match(id, UUID);
  assert.equal(rawItemId("https://www.eia.gov/todayinenergy/detail.php?id=67344"), id);
  assert.notEqual(rawItemId("https://www.eia.gov/todayinenergy/detail.php?id=67345"), id);
});
