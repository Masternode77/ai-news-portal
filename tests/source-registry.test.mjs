import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSourceRegistry, requestedSourceCoverage, REQUESTED_SOURCE_IDS } from '../scripts/lib/source-registry.mjs';

test('source registry contains all requested restoration sources', async () => {
  const sources = await loadSourceRegistry();
  const coverage = requestedSourceCoverage(sources);
  assert.equal(coverage.length, REQUESTED_SOURCE_IDS.length);
  assert.equal(coverage.every((entry) => entry.present), true);
  assert.ok(sources.length >= REQUESTED_SOURCE_IDS.length);
});
