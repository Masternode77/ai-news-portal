import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSourceRegistry, requestedSourceCoverage, REQUESTED_SOURCE_IDS, sourceRegistrySummary } from '../scripts/lib/source-registry.mjs';

test('source registry contains all requested restoration sources', async () => {
  const sources = await loadSourceRegistry();
  const coverage = requestedSourceCoverage(sources);
  assert.equal(coverage.length, REQUESTED_SOURCE_IDS.length);
  assert.equal(coverage.every((entry) => entry.present), true);
  assert.ok(sources.length >= REQUESTED_SOURCE_IDS.length);
  const summary = sourceRegistrySummary(sources);
  assert.ok(summary.total_sources >= 20);
  assert.ok(summary.active_feed_sources + summary.active_sitemap_sources >= 12);
  assert.ok(sources.filter((source) => source.status === 'active_feed' && source.feed).length >= 8);
});
