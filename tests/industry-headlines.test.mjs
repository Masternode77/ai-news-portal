import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  headlineFeeds,
  headlineFromFeedItem,
  headlineSafeForPublicSurface,
  mergeHeadlineSnapshots,
  refreshIndustryHeadlines,
  scoreHeadline,
  selectHeadlines,
} from '../scripts/lib/industry-headlines.mjs';
import { eligibleHeadlineSourceIds, headlinesBySegment, headlinesFor } from '../scripts/lib/industry-headlines-view.mjs';
import { loadSourceRegistrySync } from '../scripts/lib/source-registry.mjs';
import { updateIndustryHeadlines } from '../scripts/update-industry-headlines.mjs';

const NOW = new Date('2026-10-04T16:00:00Z');
const FEED = { sourceRegistryId: 'datacenterdynamics', source: 'DCD', url: 'https://www.datacenterdynamics.com/en/rss/', hosts: ['datacenterdynamics.com'], language: 'en' };

function feedItem(title, overrides = {}) {
  return {
    title,
    link: `https://www.datacenterdynamics.com/en/news/${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 60)}/`,
    isoDate: '2026-10-04T09:00:00Z',
    contentSnippet: 'Feed description text that must never be stored.',
    content: '<p>Full article body that must never be stored.</p>',
    ...overrides,
  };
}

test('only rows with a recorded link-only verdict feed the radar', () => {
  const sources = loadSourceRegistrySync();
  const feeds = headlineFeeds(sources, NOW);
  const ids = new Set(feeds.map((feed) => feed.sourceRegistryId));
  for (const id of ['techcrunch-ai', 'servethehome', 'toms-hardware', 'datacenterdynamics', 'nvidia-blog', 'semianalysis', 'etnews']) {
    assert.ok(ids.has(id), `${id} should be listed`);
  }
  // Ask-first, blocked and unreviewed-terms rows stay out.
  for (const id of ['bloomberg-technology', 'capacity-media', 'uptime-institute-journal', 'canary-media', 'berkeley-lab-news', 'neso', 'insidehpc', 'power-engineering', 'datacenterfrontier', 'electimes', 'ofgem']) {
    assert.ok(!ids.has(id), `${id} must not be listed`);
  }
  // Text-authorized sources already feed the wire and never enter this lane.
  for (const id of ['eia-today-in-energy', 'epoch-ai-gradient-updates', 'google-cloud-tpu-releases']) assert.ok(!ids.has(id));
  assert.equal(feeds.find((feed) => feed.sourceRegistryId === 'etnews').language, 'ko');
  // A verdict older than the review window lapses.
  assert.equal(headlineFeeds(sources, new Date('2028-01-01T00:00:00Z')).length, 0);
});

test('a headline keeps only feed-shipped fields and links to the publisher host', () => {
  const headline = headlineFromFeedItem(FEED, feedItem('Equinix raises guidance as AI leasing accelerates'), NOW);
  assert.deepEqual(Object.keys(headline).sort(), ['companies', 'id', 'language', 'publishedAt', 'score', 'segment', 'source', 'sourceRegistryId', 'title', 'url'].sort());
  assert.equal(headline.title, 'Equinix raises guidance as AI leasing accelerates');
  assert.equal(headline.segment, 'data_centers');
  assert.deepEqual(headline.companies.map((company) => company.name), ['Equinix']);
  assert.ok(!JSON.stringify(headline).includes('must never be stored'));

  assert.equal(headlineFromFeedItem(FEED, feedItem('Equinix raises guidance as AI leasing accelerates', { link: 'https://evil.example/story' }), NOW), null);
  assert.equal(headlineFromFeedItem(FEED, feedItem('Equinix raises guidance as AI leasing accelerates', { link: 'http://www.datacenterdynamics.com/en/news/x/' }), NOW), null);
  assert.equal(headlineFromFeedItem(FEED, feedItem('Equinix raises guidance as AI leasing accelerates', { isoDate: '2026-09-20T00:00:00Z' }), NOW), null);
  assert.equal(headlineFromFeedItem(FEED, feedItem('Equinix raises guidance as AI leasing accelerates', { isoDate: '2026-10-06T00:00:00Z' }), NOW), null);
});

test('titles that would fail the public copy audits never reach the page', () => {
  assert.equal(headlineSafeForPublicSurface('NVIDIA AI factory blueprint lands at Equinix'), false);
  assert.equal(headlineSafeForPublicSurface('Operator quarantined servers after AI chip recall'), false);
  assert.equal(headlineSafeForPublicSurface('Data center capacity grows across Europe…'), false);
  assert.equal(headlineSafeForPublicSurface('Copyright © 2026 all rights reserved'), false);
  assert.equal(headlineSafeForPublicSurface('CoreWeave secures $7.5bn debt facility'), true);
  assert.equal(headlineFromFeedItem(FEED, feedItem('NVIDIA AI factory blueprint lands at Equinix'), NOW), null);
});

test('scoring keeps infrastructure companies and drops consumer and generic items', () => {
  for (const title of [
    'Nvidia unveils Rubin CPX GPUs for long-context inference',
    'Microsoft signs 10-year nuclear PPA for Virginia data centers',
    'CoreWeave secures $7.5bn debt facility',
    'Google Cloud opens new region in Thailand',
    '네이버, AI 데이터센터 각 세종 2단계 증설',
  ]) assert.ok(scoreHeadline(title).score >= 3.5, title);
  for (const title of [
    'Apple releases new iPhone colors',
    'The best gaming mice of 2026',
    'Startup raises $50M to build AI agents for sales teams',
    'Meta unveils new Ray-Ban smart glasses',
    'Arm wrestling with legacy code',
    '카카오, 신규 이모티콘 이벤트',
  ]) assert.ok(scoreHeadline(title).score < 3.5, title);
});

test('selection removes cross-outlet duplicates, caps each publisher and lists newest first', () => {
  const make = (id, source, title, hour, score = 5) => ({
    id, source, sourceRegistryId: source, title, url: `https://${source}.example/${id}`, publishedAt: `2026-10-04T${String(hour).padStart(2, '0')}:00:00Z`, language: 'en', score, segment: 'chips', companies: [],
  });
  const items = [
    make('a', 'one', 'Nvidia to invest $5 billion in Intel for AI chips', 9, 7),
    make('b', 'two', 'Nvidia to invest $5 billion in Intel for AI chips partnership', 10, 6),
    ...[
      'Equinix opens Frankfurt campus',
      'Vertiv buys liquid cooling startup',
      'TSMC 2nm yields improve',
      'Oracle signs Abilene lease',
      'Micron ships HBM4 samples',
      'Arista networking orders surge',
      'GE Vernova turbine backlog grows',
      'Nebius raises convertible notes',
    ].map((title, index) => make(`c${index}`, 'three', title, 1 + index)),
  ];
  const selected = selectHeadlines(items, { perSource: 3 });
  assert.equal(selected.filter((item) => item.title.startsWith('Nvidia to invest')).length, 1);
  assert.equal(selected.filter((item) => item.sourceRegistryId === 'three').length, 3);
  for (let index = 1; index < selected.length; index += 1) {
    assert.ok(Date.parse(selected[index - 1].publishedAt) >= Date.parse(selected[index].publishedAt));
  }
});

test('refresh tolerates feed failures and reports them', async () => {
  const sources = [
    { id: 'good', name: 'Good Feed', domain: 'good.example', feed: 'https://good.example/feed', status: 'active_feed', allow_text_use: false, link_only_basis: 'feed_listing_low_risk', reviewed_at: '2026-09-05', language: 'en' },
    { id: 'bad', name: 'Bad Feed', domain: 'bad.example', feed: 'https://bad.example/feed', status: 'active_feed', allow_text_use: false, link_only_basis: 'feed_listing_permitted', reviewed_at: '2026-09-05', language: 'en' },
  ];
  const result = await refreshIndustryHeadlines({
    sources,
    now: NOW,
    fetchFeed: async (feed) => {
      if (feed.sourceRegistryId === 'bad') throw new Error('HTTP 503');
      return [
        { title: 'AMD MI450 to ship in Q3 with HBM4', link: 'https://good.example/amd-mi450', isoDate: '2026-10-04T08:00:00Z' },
        { title: 'The best gaming mice of 2026', link: 'https://good.example/mice', isoDate: '2026-10-04T08:00:00Z' },
      ];
    },
  });
  assert.deepEqual(result.feeds, { attempted: 2, succeeded: 1, failed: ['bad'] });
  assert.deepEqual(result.items.map((item) => item.title), ['AMD MI450 to ship in Q3 with HBM4']);
});

test('a thin language lane keeps its previous current headlines instead of blanking', () => {
  const item = (id, language, hoursOld) => ({
    id, title: `Headline ${id} about AI data center capacity`, url: `https://example.com/${id}`, source: 'Feed', sourceRegistryId: 'feed',
    publishedAt: new Date(NOW.getTime() - hoursOld * 3_600_000).toISOString(), language, segment: 'data_centers', companies: [], score: 5,
  });
  const previous = { items: [item('ko-1', 'ko', 5), item('ko-2', 'ko', 10), item('ko-old', 'ko', 24 * 9), item('en-old-1', 'en', 3)] };
  const englishOnly = { generatedAt: NOW.toISOString(), feeds: { attempted: 42, succeeded: 38, failed: ['etnews', 'thelec', 'datanet', 'zdnet-korea'] }, items: Array.from({ length: 9 }, (_, index) => item(`en-${index}`, 'en', index + 1)) };
  const sourceIds = new Set(['feed']);
  const merged = mergeHeadlineSnapshots(englishOnly, previous, { now: NOW, sourceIds });
  assert.deepEqual(merged.items.filter((entry) => entry.language === 'ko').map((entry) => entry.id), ['ko-1', 'ko-2']);
  assert.equal(merged.items.filter((entry) => entry.language === 'en').length, 9, 'a full English refresh replaces the old English list');
  assert.ok(!merged.items.some((entry) => entry.id === 'en-old-1'));
  assert.deepEqual(merged.carriedOver, { ko: 2 });

  const thinEnglish = { ...englishOnly, items: [item('en-new', 'en', 1)] };
  const keptEnglish = mergeHeadlineSnapshots(thinEnglish, previous, { now: NOW, sourceIds });
  assert.deepEqual(keptEnglish.items.filter((entry) => entry.language === 'en').map((entry) => entry.id), ['en-new', 'en-old-1']);
  assert.ok(!keptEnglish.items.some((entry) => entry.id === 'ko-old'), 'expired headlines are never carried over');
  for (let index = 1; index < keptEnglish.items.length; index += 1) {
    assert.ok(Date.parse(keptEnglish.items[index - 1].publishedAt) >= Date.parse(keptEnglish.items[index].publishedAt));
  }
});

test('carried-over headlines from a source that lost its verdict are dropped at once', () => {
  const item = (id, sourceRegistryId) => ({
    id, title: `Headline ${id} about AI data center capacity`, url: `https://example.com/${id}`, source: sourceRegistryId, sourceRegistryId,
    publishedAt: '2026-10-04T08:00:00Z', language: 'ko', segment: 'chips', companies: [], score: 5,
  });
  const previous = { items: [item('kept', 'etnews'), item('removed', 'thelec')] };
  const merged = mergeHeadlineSnapshots({ items: [] }, previous, { now: NOW, sourceIds: new Set(['etnews']) });
  assert.deepEqual(merged.items.map((entry) => entry.id), ['kept']);
  assert.deepEqual(mergeHeadlineSnapshots({ items: [] }, previous, { now: NOW }).items, [], 'without current eligibility nothing is carried over');

  const sources = loadSourceRegistrySync().map((row) => (row.id === 'thelec' ? { ...row, link_only_basis: '' } : row));
  const eligible = eligibleHeadlineSourceIds(sources, NOW);
  assert.ok(eligible.has('etnews'));
  assert.ok(!eligible.has('thelec'), 'removing link_only_basis removes the source');
  assert.deepEqual(headlinesFor({ items: previous.items }, { now: NOW, language: 'ko', sourceIds: eligible }).map((entry) => entry.id), ['kept'], 'pages drop it on the next build');
  assert.deepEqual([...eligibleHeadlineSourceIds(loadSourceRegistrySync(), NOW)].sort(), headlineFeeds(loadSourceRegistrySync(), NOW).map((feed) => feed.sourceRegistryId).sort());
});

test('the refresh script writes the merged snapshot and keeps a thin lane', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'radar-'));
  const file = path.join(dir, 'industry-headlines.json');
  const korean = { id: 'ko-1', title: '삼성전자, HBM4 엔비디아 공급 본격화', url: 'https://www.etnews.com/1', source: '전자신문', sourceRegistryId: 'etnews', publishedAt: '2026-10-04T08:00:00Z', language: 'ko', segment: 'chips', companies: [], score: 6 };
  await fs.writeFile(file, JSON.stringify({ generatedAt: 'previous', items: [korean] }));
  const sources = [
    { id: 'good', name: 'Good Feed', domain: 'good.example', feed: 'https://good.example/feed', status: 'active_feed', allow_text_use: false, link_only_basis: 'feed_listing_low_risk', reviewed_at: '2026-09-05', language: 'en' },
    { id: 'etnews', name: '전자신문', domain: 'etnews.com', feed: 'https://rss.etnews.com/Section901.xml', status: 'active_feed', allow_text_use: false, link_only_basis: 'feed_listing_low_risk', reviewed_at: '2026-09-10', language: 'ko' },
  ];
  const outcome = await updateIndustryHeadlines({
    now: NOW,
    sources,
    path: file,
    offline: false,
    fetchFeed: async (feed) => {
      if (feed.sourceRegistryId === 'etnews') throw new Error('HTTP 503');
      return [{ title: 'AMD MI450 to ship in Q3 with HBM4', link: 'https://good.example/amd', isoDate: '2026-10-04T09:00:00Z' }];
    },
  });
  assert.equal(outcome.written, true);
  const written = JSON.parse(await fs.readFile(file, 'utf8'));
  assert.deepEqual(written.items.map((entry) => entry.id).length, 2);
  assert.ok(written.items.some((entry) => entry.language === 'ko'), 'the Korean lane survives an English-only refresh');
  assert.equal((await updateIndustryHeadlines({ offline: true, path: file })).written, false);
});

test('view helpers filter by language, age and company and group by segment', () => {
  const data = { items: [
    { id: '1', title: 'NVIDIA GPU supply story', language: 'en', publishedAt: '2026-10-04T10:00:00Z', segment: 'chips', companies: [{ name: 'NVIDIA', segment: 'chips' }] },
    { id: '2', title: 'Equinix lease story', language: 'en', publishedAt: '2026-09-20T10:00:00Z', segment: 'data_centers', companies: [{ name: 'Equinix', segment: 'data_centers' }] },
    { id: '3', title: '삼성전자 HBM 기사', language: 'ko', publishedAt: '2026-10-04T10:00:00Z', segment: 'chips', companies: [] },
  ] };
  assert.deepEqual(headlinesFor(data, { now: NOW }).map((item) => item.id), ['1']);
  assert.deepEqual(headlinesFor(data, { now: NOW, language: 'ko' }).map((item) => item.id), ['3']);
  assert.deepEqual(headlinesFor(data, { now: NOW, company: 'nvidia' }).map((item) => item.id), ['1']);
  assert.deepEqual(headlinesFor(data, { now: NOW, company: 'Equinix' }), []);
  assert.deepEqual(headlinesBySegment(headlinesFor(data, { now: NOW, maxAgeHours: 24 * 30 })).map((group) => group.segment), ['chips', 'data_centers']);
});

test('the radar block carries no ad slot and no public card markup', async () => {
  const component = await fs.readFile('src/components/IndustryRadar.astro', 'utf8');
  assert.doesNotMatch(component, /AdSlot|data-public-card|<article\b/);
  assert.match(component, /rel="noopener noreferrer nofollow"/);
  assert.match(component, /ask for removal/);
});
