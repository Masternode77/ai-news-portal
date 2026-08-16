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

test('freshness monitor exposes a failed heartbeat ahead of an older successful cycle', () => {
  // Given: the editorial record predates a failed scheduled run.
  const status = buildFreshnessStatus({
    cycles: [{
      cycle_completed_at: '2026-05-20T04:00:00Z',
      status: 'completed',
      published_analyses: ['analysis-1'],
      latest_analysis_published_at: '2026-05-20T04:00:00Z',
    }],
    heartbeat: {
      status: 'failed',
      last_pipeline_run_at: '2026-05-20T05:00:00Z',
      last_successful_pipeline_at: '2026-05-20T04:00:00Z',
    },
  }, new Date('2026-05-20T05:05:00Z'));

  // When: public freshness is derived.
  // Then: readers see the failed update while retaining the last successful time.
  assert.equal(status.freshness_state, 'failed_pipeline');
  assert.equal(status.last_successful_pipeline_at, '2026-05-20T04:00:00Z');
});

test('fresh successful heartbeat prevents an older editorial cycle from reporting the pipeline overdue', () => {
  const status = buildFreshnessStatus({
    cycles: [{
      cycle_completed_at: '2026-05-19T20:00:00Z',
      status: 'completed',
      published_analyses: ['analysis-1'],
      latest_analysis_published_at: '2026-05-19T20:00:00Z',
    }],
    heartbeat: {
      status: 'ok',
      last_pipeline_run_at: '2026-05-20T05:00:00Z',
      last_successful_pipeline_at: '2026-05-20T05:00:00Z',
    },
  }, new Date('2026-05-20T05:05:00Z'));

  assert.equal(status.freshness_state, 'pipeline_current');
  assert.equal(status.last_successful_pipeline_at, '2026-05-20T05:00:00Z');
});
