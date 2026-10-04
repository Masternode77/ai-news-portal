import assert from 'node:assert/strict';
import test from 'node:test';
import { carryOverPoolItems, fetchNewsPoolResult, selectPoolItems } from '../scripts/lib/fetch-feeds.mjs';

const NOW = new Date('2026-10-04T12:00:00.000Z');

function source(overrides = {}) {
  return {
    id: 'research-feed',
    name: 'Research Feed',
    domain: 'research.example',
    feed: 'https://research.example/feed',
    status: 'active_feed',
    text_use_basis: 'licensed',
    terms_url: 'https://research.example/terms',
    reviewed_at: '2026-09-01',
    allow_text_use: true,
    ...overrides,
  };
}

function item(id, hoursOld, overrides = {}) {
  return {
    id,
    source: 'Research Feed',
    sourceRegistryId: 'research-feed',
    url: `https://research.example/papers/${id}`,
    title: `GPU cluster power scheduling paper ${id}`,
    snippet: `Data center GPU capacity and grid power study ${id}`,
    publishedAt: new Date(NOW.getTime() - hoursOld * 3_600_000).toISOString(),
    infrastructure_relevance_score: 0.7,
    infrastructure_relevance_tier: 'signal_card',
    ai_topic_score: 0,
    ...overrides,
  };
}

test('processed items hold no pool slot, so unprocessed items from the same source take it', () => {
  const fetched = Array.from({ length: 9 }, (_, index) => item(`p${index}`, index + 1, { infrastructure_relevance_score: 0.9 - index * 0.01 }));
  const selected = selectPoolItems(fetched, NOW.getTime(), { excludeIds: ['p0', 'p1', 'p2'] }).map((entry) => entry.id);
  assert.deepEqual(selected, ['p3', 'p4', 'p5', 'p6', 'p7', 'p8'], 'six per source, none of them already processed');
  assert.deepEqual(
    selectPoolItems(fetched, NOW.getTime()).map((entry) => entry.id),
    ['p0', 'p1', 'p2', 'p3', 'p4', 'p5'],
    'without exclusions the ranking is unchanged',
  );
});

test('only unprocessed, fresh, still-authorized items without a live copy are carried over', () => {
  const sources = [source()];
  const previous = [
    item('keep', 30),
    item('processed', 30),
    item('stale', 24 * 12),
    item('live', 30, { title: 'Old copy of the live item' }),
    item('unknown-source', 30, { sourceRegistryId: 'unknown-feed', source: 'Unknown', url: 'https://unknown.example/a' }),
    { id: 'broken', title: 'A record without a URL' },
  ];
  const carried = carryOverPoolItems(previous, { fetched: [item('live', 1)], excludeIds: ['processed'], sources, now: NOW });
  assert.deepEqual(carried.map((entry) => entry.id), ['keep']);

  const withdrawn = carryOverPoolItems([item('keep', 30)], { sources: [source({ allow_text_use: false })], now: NOW });
  assert.deepEqual(withdrawn, [], 'a source that no longer authorizes text use carries nothing');

  const research = carryOverPoolItems([item('weekly', 24 * 15, { pool_max_age_days: 21 })], { sources, now: NOW });
  assert.deepEqual(research.map((entry) => entry.id), ['weekly'], 'a registry research window keeps its own maximum age');
});

test('a retitled live item replaces its carried copy, but a sibling note on another anchor stays', () => {
  const sources = [source()];
  const previous = [
    item('old-title', 30, { url: 'https://research.example/papers/42/?utm_source=rss' }),
    item('same-page-other-anchor', 30, { url: 'https://research.example/notes#October_01' }),
    item('other-source-same-url', 30, { sourceRegistryId: 'second-feed', source: 'Second Feed', url: 'https://research.example/papers/42' }),
  ];
  const fetched = [
    item('new-title', 1, { url: 'https://research.example/papers/42', title: 'Retitled paper 42' }),
    item('live-note', 1, { url: 'https://research.example/notes#October_02' }),
  ];
  const carried = carryOverPoolItems(previous, {
    fetched,
    sources: [...sources, source({ id: 'second-feed', name: 'Second Feed' })],
    now: NOW,
  });
  assert.deepEqual(carried.map((entry) => entry.id), ['same-page-other-anchor', 'other-source-same-url']);
});

test('a weekend run with an empty research feed still offers the unprocessed weekday items', async () => {
  const result = await fetchNewsPoolResult({
    sources: [source()],
    now: NOW,
    fetchFeed: async () => [],
    previousItems: [item('fri-a', 40), item('fri-b', 41), item('fri-processed', 42)],
    excludeIds: ['fri-processed'],
  });
  assert.equal(result.status, 'fetched');
  assert.deepEqual(result.items.map((entry) => entry.id).sort(), ['fri-a', 'fri-b']);
  assert.equal(result.carriedOverCount, 2);
});

test('the live copy wins and carried items compete for the same per-source slots', async () => {
  const live = Array.from({ length: 5 }, (_, index) => item(`live-${index}`, 2 + index, { infrastructure_relevance_score: 0.8 }));
  const previous = [
    item('live-0', 2, { title: 'Old headline for live-0', infrastructure_relevance_score: 0.1 }),
    item('carried-a', 30, { infrastructure_relevance_score: 0.9 }),
    item('carried-b', 31, { infrastructure_relevance_score: 0.6 }),
  ];
  const result = await fetchNewsPoolResult({ sources: [source()], now: NOW, fetchFeed: async () => live, previousItems: previous });
  const ids = result.items.map((entry) => entry.id);
  assert.equal(ids.length, 6, 'six per source');
  assert.ok(ids.includes('carried-a'));
  assert.ok(!ids.includes('carried-b'), 'the lowest-ranked item loses the last slot');
  assert.equal(result.items.find((entry) => entry.id === 'live-0').title, live[0].title);
  assert.equal(result.carriedOverCount, 1);
});

test('a failed fetch that leaves only carried items still reports a transient failure', async () => {
  const result = await fetchNewsPoolResult({
    sources: [source()],
    now: NOW,
    fetchFeed: async () => { throw new Error('timeout'); },
    previousItems: [item('fri-a', 40)],
  });
  assert.equal(result.status, 'transient_fetch_failure', 'the pipeline keeps its retry and cached-pool fallback');
});
