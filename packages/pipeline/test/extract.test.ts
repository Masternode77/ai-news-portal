import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CC_BY_4_URL,
  MAX_EXTRACTED_PARAGRAPHS,
  ecPressApiUrl,
  extractArxivAbstract,
  extractEcPress,
  extractEpoch,
  extractGeneric,
  extractGoogleReleaseNotes,
  runExtraction,
} from "../src/adapters/index.ts";

const LONG = "This paragraph is comfortably longer than the sixty character minimum used by the extractor.";
const LICENCE = `<footer><a href="${CC_BY_4_URL}">CC BY 4.0</a></footer>`;

test("generic extraction prefers <article>, then <main>, then the cleaned page", () => {
  const article = extractGeneric(`<html><body><nav><p>${LONG} nav</p></nav><article><p>${LONG} one</p><p>${LONG} two</p></article><aside><p>${LONG} aside</p></aside></body></html>`);
  assert.equal(article.method, "generic:article");
  assert.equal(article.paragraphs, 2);
  assert.ok(article.text.includes("one") && article.text.includes("two") && !article.text.includes("nav"));

  const main = extractGeneric(`<html><body><main><p>${LONG} main</p></main></body></html>`);
  assert.equal(main.method, "generic:main");

  const page = extractGeneric(`<html><body><div><p>${LONG} page</p><p>Subscribe to our newsletter for more updates every single week of the year.</p></div></body></html>`);
  assert.equal(page.method, "generic:page");
  assert.ok(!page.text.includes("Subscribe"), "boilerplate paragraphs are dropped");

  const many = extractGeneric(`<article>${Array.from({ length: MAX_EXTRACTED_PARAGRAPHS + 5 }, (_, i) => `<p>${LONG} ${i}</p>`).join("")}</article>`);
  assert.equal(many.paragraphs, MAX_EXTRACTED_PARAGRAPHS);
  assert.equal(many.limitExceeded, true);
});

test("Google release notes: only the dated section, only with the CC BY 4.0 link", () => {
  const html = `<html><body><article><h2 id="October_07_2026">October 07, 2026</h2><p>Compute Engine: ${LONG}</p><ul><li>bullet</li></ul><h2 id="October_06_2026">October 06, 2026</h2><p>Older ${LONG}</p></article>${LICENCE}</body></html>`;
  const url = "https://docs.cloud.google.com/compute/docs/release-notes#October_07_2026";
  const extraction = extractGoogleReleaseNotes(html, url);
  assert.equal(extraction.licenseOk, true);
  assert.ok(extraction.text.startsWith("Compute Engine:"));
  assert.ok(!extraction.text.includes("Older"));

  assert.throws(() => extractGoogleReleaseNotes(html.replace(LICENCE, ""), url), /LICENSE_MARKER_MISSING/);
  assert.throws(() => extractGoogleReleaseNotes(html, "https://docs.cloud.google.com/compute/docs/release-notes#October_01_2026"), /EXTRACTION_FAILED/);
  assert.throws(() => extractGoogleReleaseNotes(html, "https://docs.cloud.google.com/compute/docs/release-notes"), /EXTRACTION_FAILED/);

  const listOnly = `<html><body><h2 id="October_07_2026">x</h2><ul><li>Feature A is now generally available in region asia-northeast3 for all customers.</li></ul><h2 id="October_06_2026">y</h2>${LICENCE}</body></html>`;
  const list = extractGoogleReleaseNotes(listOnly, url);
  assert.equal(list.method, "google_release_notes:section_text");
  assert.ok(list.text.includes("Feature A"));
});

test("Epoch AI body sits between the content markers and needs the licence link", () => {
  const html = `<html><body><div class="content-header"><time>Oct 15, 2026</time></div><div class="formatted-text content-body article-content"><p>${LONG} epoch</p></div><div class="content-sidebar-right"><p>${LONG} sidebar</p></div>${LICENCE}</body></html>`;
  const extraction = extractEpoch(html);
  assert.equal(extraction.method, "epoch_index");
  assert.ok(extraction.text.includes("epoch") && !extraction.text.includes("sidebar"));
  assert.throws(() => extractEpoch(html.replace(LICENCE, "")), /LICENSE_MARKER_MISSING/);
  assert.throws(() => extractEpoch(`<html><body><p>${LONG}</p>${LICENCE}</body></html>`), /EXTRACTION_FAILED/);
});

test("arXiv abstract: the abstract blockquote only", () => {
  const html = `<html><body><blockquote class="abstract mathjax"><span class="descriptor">Abstract:</span>We study GPU scheduling for ${LONG}</blockquote><div class="full-text">${LONG}</div></body></html>`;
  const extraction = extractArxivAbstract(html);
  assert.ok(extraction.text.startsWith("We study GPU scheduling"));
  assert.equal(extraction.method, "arxiv_abstract");
  assert.throws(() => extractArxivAbstract("<html><body><p>no abstract</p></body></html>"), /EXTRACTION_FAILED/);
});

test("EC press corner: detail url -> documents API, htmlContent -> text", () => {
  assert.equal(ecPressApiUrl("https://ec.europa.eu/commission/presscorner/detail/en/ip_26_1234"), "https://ec.europa.eu/commission/presscorner/api/documents?reference=IP%2F26%2F1234&language=en");
  assert.equal(ecPressApiUrl("https://ec.europa.eu/commission/presscorner/detail/en/IP_26_1234?utm=x"), "https://ec.europa.eu/commission/presscorner/api/documents?reference=IP%2F26%2F1234&language=en");
  assert.equal(ecPressApiUrl("https://ec.europa.eu/commission/presscorner/home/en"), null);
  const extraction = extractEcPress(JSON.stringify({ docuLanguageResource: { htmlContent: `<p>${LONG} press</p>` } }));
  assert.equal(extraction.method, "ec_press");
  assert.ok(extraction.text.includes("press"));
  assert.throws(() => extractEcPress("not json"), /EXTRACTION_FAILED/);
  assert.throws(() => extractEcPress(JSON.stringify({ docuLanguageResource: {} })), /EXTRACTION_FAILED/);
});

test("runExtraction dispatches by kind and enforces a visible licence marker", () => {
  const body = `<html><body><article><p>${LONG} marker test</p></article><footer>Distributed under CC BY 4.0</footer></body></html>`;
  const ok = runExtraction({ kind: "generic", url: "https://kubernetes.io/blog/x/", body, licenseMarker: "Distributed under CC BY 4.0" });
  assert.equal(ok.licenseOk, true);
  assert.throws(() => runExtraction({ kind: "generic", url: "https://kubernetes.io/blog/x/", body: body.replace("Distributed under CC BY 4.0", ""), licenseMarker: "Distributed under CC BY 4.0" }), /LICENSE_MARKER_MISSING/);
  assert.throws(() => runExtraction({ kind: "none", url: "https://x.test/", body }), /EXTRACTION_FAILED/);
  assert.throws(() => runExtraction({ kind: "generic", url: "https://x.test/", body: "<html><body></body></html>" }), /EXTRACTION_FAILED/);
});
