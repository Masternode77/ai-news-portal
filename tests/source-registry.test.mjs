import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { FEEDS } from '../scripts/lib/constants.mjs';
import { loadSourceRegistry, requestedSourceCoverage, REQUESTED_SOURCE_IDS } from '../scripts/lib/source-registry.mjs';
import { sourceCredibilityTier } from '../scripts/lib/source-priority-policy.mjs';

test('source registry contains all requested restoration sources', async () => {
  const sources = await loadSourceRegistry();
  const coverage = requestedSourceCoverage(sources);
  assert.equal(coverage.length, REQUESTED_SOURCE_IDS.length);
  assert.equal(coverage.every((entry) => entry.present), true);
  assert.ok(sources.length >= REQUESTED_SOURCE_IDS.length);
});

test('Capacity Media registry follows its canonical Capacity domain and feed', async () => {
  const sources = await loadSourceRegistry();
  const capacity = sources.find((source) => source.id === 'capacity-media');

  assert.equal(capacity?.domain, 'capacityglobal.com');
  assert.equal(capacity?.feed, 'https://capacityglobal.com/feed/');
  assert.equal(
    FEEDS.find((feed) => feed.source === 'Capacity Media')?.url,
    'https://capacityglobal.com/feed/',
  );
  assert.equal(sourceCredibilityTier({ url: 'https://capacityglobal.com/news/grid-capacity/' }), 2);

  const priorityPolicy = fs.readFileSync(new URL('../config/sourcePriority.yml', import.meta.url), 'utf8');
  assert.match(priorityPolicy, /capacityglobal\.com/);
  assert.doesNotMatch(priorityPolicy, /capacitymedia\.com/);
});
