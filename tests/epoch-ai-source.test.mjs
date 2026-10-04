import assert from 'node:assert/strict';
import test from 'node:test';
import {
  epochArticleMetadata,
  epochArticleSection,
  epochArticleTarget,
  epochIndexLinks,
  epochPublishedAt,
  fetchEpochIndexItems,
} from '../scripts/lib/epoch-ai.mjs';
import { activeRegistryFeeds, loadSourceRegistrySync } from '../scripts/lib/source-registry.mjs';
import { articlePathWithinPrefix, sourceTextTargetDecision } from '../scripts/lib/source-text-fetcher.mjs';
import { GOOGLE_RELEASE_SOURCE_PATTERN, googleReleaseNoteTarget } from '../scripts/lib/google-cloud-release-notes.mjs';

const NOW = new Date('2026-10-04T16:00:00Z');
const LICENSE = '<a href="https://creativecommons.org/licenses/by/4.0/">Creative Commons Attribution license</a>';

function articlePage({ title = 'Will financing bottleneck AI compute? An Anthropic case study', date = 'Aug. 12, 2026', licensed = true } = {}) {
  return `<!doctype html><html><head><title>${title} | Epoch AI</title>
<meta property="og:title" content="${title}">
<meta property="og:description" content="Why Anthropic&#39;s buildout suggests financing is not the immediate blocker.">
</head><body><nav><a href="/data-insights">Data</a></nav>
<div class="header content-header"><h1 class="title">${title}</h1><span>${date}</span></div>
<div class="content-main"><div class="formatted-text content-body article-content">
<p>Compute scaling has driven much of the progress in AI so far, and maintaining recent growth rates requires exponentially increasing amounts of capital.</p>
<p>Anthropic's infrastructure buildout provides a useful test case for whether institutional investors will fund the next generation of compute.</p>
</div><div class="content-sidebar-right"><p>Related research that should never be extracted as article text.</p></div></div>
<footer>${licensed ? LICENSE : ''}</footer></body></html>`;
}

test('epoch article targets are canonical section slugs on epoch.ai only', () => {
  assert.equal(epochArticleTarget('https://epoch.ai/gradient-updates/is-a-compute-crunch-coming')?.section, 'Gradient Updates');
  assert.equal(epochArticleTarget('https://epoch.ai/data-insights/ai-chip-production/')?.url, 'https://epoch.ai/data-insights/ai-chip-production');
  for (const url of [
    'http://epoch.ai/gradient-updates/x-y',
    'https://www.epoch.ai/gradient-updates/x-y',
    'https://epoch.ai/assets/docs/report',
    'https://epoch.ai/gradient-updates/x-y?ref=feed',
    'https://epoch.ai/gradient-updates/x-y#section',
    'https://epoch.ai/gradient-updates/nested/path',
    'https://epoch.ai:8443/gradient-updates/x-y',
    'https://user@epoch.ai/gradient-updates/x-y',
  ]) assert.equal(epochArticleTarget(url), null, url);
});

test('index links keep page order, stay in the section and deduplicate', () => {
  const html = `<a href="/gradient-updates/is-a-compute-crunch-coming">A</a>
    <a href="/data-insights/ai-chip-production">B</a>
    <a href="/gradient-updates/will-financing-bottleneck-ai-compute">C</a>
    <a href="/gradient-updates/is-a-compute-crunch-coming">A again</a>
    <a href="https://evil.example/gradient-updates/spoof">D</a>`;
  assert.deepEqual(epochIndexLinks(html, '/gradient-updates/'), [
    'https://epoch.ai/gradient-updates/is-a-compute-crunch-coming',
    'https://epoch.ai/gradient-updates/will-financing-bottleneck-ai-compute',
  ]);
  assert.deepEqual(epochIndexLinks(html, '/unknown/'), []);
});

test('article metadata requires the CC BY licence link and a parseable date', () => {
  const url = 'https://epoch.ai/gradient-updates/will-financing-bottleneck-ai-compute';
  const metadata = epochArticleMetadata(articlePage(), url);
  assert.equal(metadata.title, 'Will financing bottleneck AI compute? An Anthropic case study');
  assert.equal(metadata.publishedAt, '2026-08-12T12:00:00.000Z');
  assert.match(metadata.description, /Anthropic's buildout/);
  assert.equal(epochArticleMetadata(articlePage({ licensed: false }), url), null);
  assert.equal(epochArticleMetadata(articlePage({ date: 'sometime last year' }), url), null);
  assert.equal(epochPublishedAt('<div class="content-header">Sept. 3, 2026</div>'), '2026-09-03T12:00:00.000Z');
});

test('article section is the body only, and empty without the licence', () => {
  const url = 'https://epoch.ai/gradient-updates/will-financing-bottleneck-ai-compute';
  const section = epochArticleSection(articlePage(), url);
  assert.match(section, /Compute scaling has driven/);
  assert.doesNotMatch(section, /Related research/);
  assert.equal(epochArticleSection(articlePage({ licensed: false }), url), '');
  assert.equal(epochArticleSection(articlePage(), 'https://epoch.ai/assets/docs/x'), '');
});

test('index fetch lists licensed articles and skips failures', async () => {
  const pages = new Map([
    ['https://epoch.ai/gradient-updates', '<a href="/gradient-updates/one-story">1</a><a href="/gradient-updates/two-story">2</a><a href="/gradient-updates/three-story">3</a>'],
    ['https://epoch.ai/gradient-updates/one-story', articlePage({ title: 'One story about compute financing' })],
    ['https://epoch.ai/gradient-updates/two-story', articlePage({ title: 'Unlicensed copy', licensed: false })],
  ]);
  const items = await fetchEpochIndexItems(
    { url: 'https://epoch.ai/gradient-updates', articlePathPrefix: '/gradient-updates/' },
    { fetchHtml: async (url) => { if (!pages.has(url)) throw new Error('404'); return pages.get(url); } },
  );
  assert.deepEqual(items.map((item) => item.link), ['https://epoch.ai/gradient-updates/one-story']);
  assert.equal(items[0].isoDate, '2026-08-12T12:00:00.000Z');
});

test('registry authorizes the new licensed rows and scopes Epoch to its sections', () => {
  const sources = loadSourceRegistrySync();
  const feeds = activeRegistryFeeds(sources, NOW);
  const ids = new Set(feeds.map((feed) => feed.sourceRegistryId));
  for (const id of ['epoch-ai-gradient-updates', 'epoch-ai-data-insights', 'google-cloud-tpu-releases', 'kubernetes-blog']) {
    assert.ok(ids.has(id), id);
  }
  const epoch = feeds.find((feed) => feed.sourceRegistryId === 'epoch-ai-gradient-updates');
  assert.equal(epoch.feedFormat, 'epoch_html_index');
  assert.equal(epoch.articlePathPrefix, '/gradient-updates/');

  const allowed = sourceTextTargetDecision({ sourceRegistryId: 'epoch-ai-gradient-updates', url: 'https://epoch.ai/gradient-updates/is-a-compute-crunch-coming' }, sources, NOW);
  assert.equal(allowed.authorized, true);
  for (const url of ['https://epoch.ai/data-insights/ai-chip-production', 'https://epoch.ai/gradient-updates/a/b', 'https://epoch.ai/gradient-updates/x?y=1', 'https://epoch.ai/about']) {
    const denied = sourceTextTargetDecision({ sourceRegistryId: 'epoch-ai-gradient-updates', url }, sources, NOW);
    assert.equal(denied.authorized, false, url);
  }
  assert.equal(articlePathWithinPrefix(new URL('https://epoch.ai/data-insights/ok-slug'), '/data-insights/'), true);
  assert.equal(articlePathWithinPrefix(new URL('https://epoch.ai/data-insights/ok-slug'), 'data-insights'), false);
});

test('Google Cloud TPU release notes use the dated-section release adapter', () => {
  assert.ok(GOOGLE_RELEASE_SOURCE_PATTERN.test('google-cloud-tpu-releases'));
  assert.equal(googleReleaseNoteTarget('https://docs.cloud.google.com/tpu/docs/release-notes#June_01_2026')?.product, 'Google Cloud TPU');
  assert.equal(googleReleaseNoteTarget('https://docs.cloud.google.com/tpu/docs/release-notes'), null);
});

function networkFor(body) {
  return {
    resolveHost: async () => [{ address: '93.184.216.34', family: 4 }],
    request: async () => ({ status: 200, headers: { 'content-type': 'text/html' }, body: { async *[Symbol.asyncIterator]() { yield Buffer.from(body); } }, destroy() {} }),
  };
}

test('source fetch extracts the licensed Epoch body and refuses an unlicensed page', async () => {
  const { fetchArticleExtraction } = await import('../scripts/lib/source-fetch.mjs');
  const sources = loadSourceRegistrySync();
  const url = 'https://epoch.ai/gradient-updates/will-financing-bottleneck-ai-compute';
  const ok = await fetchArticleExtraction({ url, sourceRegistryId: 'epoch-ai-gradient-updates', sources, now: NOW, networkOptions: networkFor(articlePage()) });
  assert.match(ok.articleText, /^Compute scaling has driven/);
  assert.doesNotMatch(ok.articleText, /Related research/);
  const refused = await fetchArticleExtraction({ url, sourceRegistryId: 'epoch-ai-gradient-updates', sources, now: NOW, networkOptions: networkFor(articlePage({ licensed: false })) });
  assert.equal(refused.extractionQa.extraction_failure_reason, 'epoch_license_or_body_missing');
});

test('a registry licence marker must appear on every extracted page', async () => {
  const { fetchArticleExtraction } = await import('../scripts/lib/source-fetch.mjs');
  const sources = loadSourceRegistrySync();
  const url = 'https://kubernetes.io/blog/2026/09/22/dynamic-resource-allocation-for-accelerators/';
  const body = '<main><p>Dynamic resource allocation lets a Kubernetes cluster schedule GPUs and other accelerators for AI training and inference workloads.</p></main>';
  const withMarker = await fetchArticleExtraction({ url, sourceRegistryId: 'kubernetes-blog', sources, now: NOW, networkOptions: networkFor(`${body}<footer>The Kubernetes Authors | Documentation Distributed under CC BY 4.0</footer>`) });
  assert.match(withMarker.articleText, /Dynamic resource allocation/);
  const withoutMarker = await fetchArticleExtraction({ url, sourceRegistryId: 'kubernetes-blog', sources, now: NOW, networkOptions: networkFor(body) });
  assert.equal(withoutMarker.extractionQa.extraction_failure_reason, 'license_marker_missing');
});
