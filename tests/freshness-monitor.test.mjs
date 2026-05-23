import assert from 'node:assert/strict';
import test from 'node:test';
import { buildFreshnessStatus } from '../scripts/lib/freshness-monitor.mjs';

test('freshness monitor separates no-publish cycles from stale pipelines', () => {
  const status = buildFreshnessStatus({
    cycles: [{
      cycle_completed_at: '2026-05-20T04:00:00Z',
      status: 'completed_no_qualifying_signals',
      published_analyses: [],
    }],
  }, new Date('2026-05-20T05:00:00Z'));
  assert.equal(status.freshness_state, 'cycle_no_publish');
});
