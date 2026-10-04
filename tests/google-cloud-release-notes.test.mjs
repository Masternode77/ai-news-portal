import assert from 'node:assert/strict';
import test from 'node:test';
import { googleReleaseNoteSection, googleReleaseNoteTarget, scopeGoogleAiReleaseItem } from '../scripts/lib/google-cloud-release-notes.mjs';
import { loadSourceRegistrySync, activeRegistryFeeds } from '../scripts/lib/source-registry.mjs';
import { sourceTextTargetDecision } from '../scripts/lib/source-text-fetcher.mjs';
import { currentSourceTextAuthorization } from '../scripts/lib/source-text-publication-authorization.mjs';
import { createExtractionArtifact } from '../scripts/lib/extraction-artifact.mjs';
import { parseFeedItem } from '../scripts/lib/fetch-feeds.mjs';
import { fetchArticleExtraction } from '../scripts/lib/source-fetch.mjs';
import { storyKeyFor } from '../scripts/lib/authored-column-engine.mjs';
import { safeHttpUrl } from '../scripts/lib/normalize.mjs';
import { dedupeSourceItems } from '../scripts/lib/source-deduplication.mjs';
import { publicSourceEvidence } from '../scripts/lib/public-product-fit.mjs';
import { buildHomepageFeed } from '../scripts/lib/homepage-feed-builder.mjs';
import { SOURCE_TEXT, fixtureArticle } from './fixtures/authored-column-fixture.mjs';

const now = new Date('2026-10-04T12:00:00Z');
const sources = loadSourceRegistrySync();
const sourceRegistryId = 'google-cloud-compute-releases';
const url = 'https://docs.cloud.google.com/compute/docs/release-notes#September_30_2026';
const license = '<a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>';
const html = `<article><h2 id="September_30_2026">September 30</h2><p>${SOURCE_TEXT}</p><h2 id="September_29_2026">September 29</h2><p>Unrelated prior announcement must not enter the evidence.</p></article>${license}`;

test('reviewed sources enable only scoped documentation and never provider images or unreviewed blogs', () => {
  const feeds = activeRegistryFeeds(sources, now);
  assert.ok(feeds.some(f => f.sourceRegistryId === sourceRegistryId));
  assert.ok(feeds.some(f => f.sourceRegistryId === 'google-cloud-ai-releases'));
  for (const id of ['google-cloud-blog', 'nvidia-blog', 'aws-news-blog', 'microsoft-azure-blog']) assert.ok(!feeds.some(f => f.sourceRegistryId === id));
  assert.equal(sourceTextTargetDecision({ url, sourceRegistryId }, sources, now).authorized, true);
  assert.equal(sourceTextTargetDecision({ url: url.replace('/compute/docs/release-notes', '/unreviewed'), sourceRegistryId }, sources, now).authorized, false);
  assert.equal(sourceTextTargetDecision({ url: url.replace('docs.cloud.google.com', 'cloud.google.com'), sourceRegistryId }, sources, now).authorized, false);
  assert.equal(sources.find(s => s.id === sourceRegistryId).allow_image_reuse, false);
});

test('dated extraction stops at the next release and fails closed on missing scope or licence', () => {
  assert.ok(googleReleaseNoteSection(html, url).includes(SOURCE_TEXT));
  assert.ok(!googleReleaseNoteSection(html, url).includes('Unrelated prior'));
  assert.equal(googleReleaseNoteSection(html.replace(license, ''), url), '');
  assert.equal(googleReleaseNoteSection(html, url.replace('30_2026', '28_2026')), '');
  assert.equal(googleReleaseNoteTarget(url.replace('docs.cloud.google.com', 'evil.example')), null);
  assert.equal(googleReleaseNoteSection(html, url.split('#')[0]), '');
  assert.notEqual(storyKeyFor({ url }), storyKeyFor({ url: url.replace('30_2026', '29_2026') }));
  assert.equal(safeHttpUrl(url), url);
  assert.equal(safeHttpUrl('https://example.com/article#tracking'), 'https://example.com/article');
  assert.equal(dedupeSourceItems([{ title: 'First release', url }, { title: 'Second release', url: url.replace('30_2026', '29_2026') }]).length, 2);
});

test('feed title includes the product and actual announcement, not a bare date', () => {
  const feed = activeRegistryFeeds(sources, now).find(f => f.sourceRegistryId === sourceRegistryId);
  const item = parseFeedItem(feed, { title: 'September 30, 2026', link: url, isoDate: '2026-09-30T07:00:00Z', content: '<h3>Feature</h3><p>Compute Engine expands GPU instance availability in a cloud region.</p>' }, now);
  assert.match(item.title, /^Google Cloud Compute Engine: Compute Engine expands GPU/);
  assert.equal(item.publishedAt, '2026-09-30T07:00:00.000Z');
  assert.equal(item.url, url);
});

test('aggregate discovery feed isolates AI product content and links the licensed product page', () => {
  const item = { link: 'https://docs.cloud.google.com/release-notes#September_30_2026', contentSnippet: 'Other product text', content: '<h2>Apigee</h2><p>Ignore</p><h2 class="release-note-product-title">Gemini Enterprise Agent Platform</h2><p>Model serving update.</p><h2>Storage</h2><p>Unrelated.</p>' };
  const scoped = scopeGoogleAiReleaseItem(item);
  assert.equal(scoped.link, 'https://docs.cloud.google.com/gemini-enterprise-agent-platform/release-notes#September_30_2026');
  assert.equal(scoped.content, '<p>Model serving update.</p>');
  assert.equal(scoped.contentSnippet, undefined);
  assert.equal(scopeGoogleAiReleaseItem({ ...item, content: '<h2>Storage</h2>' }), null);
  assert.equal(scopeGoogleAiReleaseItem({ ...item, link: 'https://evil.example/release-notes#September_30_2026' }), null);
});

test('source fetch uses only the licensed date section and never the whole archive as fallback', async () => {
  const options = body => ({
    resolveHost: async () => [{ address: '93.184.216.34', family: 4 }],
    request: async () => ({ status: 200, headers: { 'content-type': 'text/html' }, body: { async *[Symbol.asyncIterator]() { yield Buffer.from(body); } }, destroy() {} }),
  });
  const result = await fetchArticleExtraction({ url, sourceRegistryId, sources, now, networkOptions: options(html) });
  assert.equal(result.articleText, SOURCE_TEXT);
  assert.equal(result.extractionQa.extraction_failure_reason, null);
  const missing = await fetchArticleExtraction({ url, sourceRegistryId, sources, now, networkOptions: options(html.replace(license, '')) });
  assert.equal(missing.articleText, '');
  assert.equal(missing.extractionQa.extraction_failure_reason, 'release_note_anchor_or_license_missing');
  const empty = await fetchArticleExtraction({ url, sourceRegistryId, sources, now, fallbackSnippet: SOURCE_TEXT, networkOptions: options(html.replace(SOURCE_TEXT, '')) });
  assert.equal(empty.extractionQa.extraction_failure_reason, 'release_note_text_missing');
});

test('publication authorization binds evidence to its exact dated source and reviewed path', () => {
  const extractionQa = { public_publishable: true, can_generate_longform: true, block_reasons: [], sentence_completion_score: 1 };
  const artifact = createExtractionArtifact({ sourceUrl: url, cleanedExtractedText: SOURCE_TEXT, extractionQa });
  const article = { sourceRegistryId, sourceUrl: url };
  assert.equal(currentSourceTextAuthorization(article, artifact, { sourceRegistry: sources, now }).ok, true);
  assert.equal(currentSourceTextAuthorization({ ...article, sourceUrl: url.replace('30_2026', '29_2026') }, artifact, { sourceRegistry: sources, now }).ok, false);
  assert.equal(currentSourceTextAuthorization({ ...article, sourceUrl: url.replace('/compute/docs/release-notes', '/unreviewed') }, artifact, { sourceRegistry: sources, now }).ok, false);
  for (const invalidUrl of [url.split('#')[0], url.replace('#September_30_2026', '#bogus'), url.replace('https:', 'http:'), url.replace('docs.cloud.google.com', 'docs.cloud.google.com:444'), url.replace('docs.cloud.google.com', 'reader@docs.cloud.google.com')]) {
    const invalidArtifact = createExtractionArtifact({ sourceUrl: invalidUrl, cleanedExtractedText: SOURCE_TEXT, extractionQa });
    assert.equal(googleReleaseNoteTarget(invalidUrl), null);
    assert.equal(currentSourceTextAuthorization({ ...article, sourceUrl: invalidUrl }, invalidArtifact, { sourceRegistry: sources, now }).ok, false, invalidUrl);
  }
});

test('homepage preserves different release dates and product-fit evidence never crosses dates', () => {
  const records = [url, url.replace('30_2026', '29_2026')].map((sourceUrl, index) => fixtureArticle({
    id: `dated-release-${index}`, sourceRegistryId, sourceUrl,
    public_content_tier: 'signal_card', public_status: 'published',
    publishedAt: `2026-09-${30 - index}T07:00:00Z`,
    extraction_artifact: createExtractionArtifact({ sourceUrl, cleanedExtractedText: SOURCE_TEXT, extractionQa: { public_publishable: true, can_generate_longform: true, sentence_completion_score: 1 } }),
  }));
  assert.equal(publicSourceEvidence(records[0]).articleText, SOURCE_TEXT);
  assert.equal(publicSourceEvidence({ ...records[0], sourceUrl: records[1].sourceUrl }).articleText, undefined);
  const feed = buildHomepageFeed(records, { sourceRegistry: sources, now });
  assert.equal(feed.items.length, 2);
  assert.equal(new Set(feed.items.map(item => item.publicSignal.read_source)).size, 2);
});
