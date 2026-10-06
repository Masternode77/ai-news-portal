import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { evaluatePipelineHeartbeat } from '../scripts/lib/operations-monitor.mjs';

const now = new Date('2026-10-06T12:00:00Z');
const recent = {
  status: 'ok',
  last_pipeline_run_at: '2026-10-06T11:00:00Z',
  last_successful_pipeline_at: '2026-10-06T11:00:00Z',
};
const evaluate = (heartbeat, options = {}) => evaluatePipelineHeartbeat({ heartbeat, now, authorizedSourceCount: 2, ...options });

test('generation heartbeat alone determines freshness, regardless of successful validation runs', () => {
  assert.equal(evaluate(recent).status, 'healthy');
  const old = { ...recent, last_successful_pipeline_at: '2026-10-05T22:00:00Z' };
  assert.equal(evaluate(old, { successfulRuns: [{ conclusion: 'success', updated_at: now.toISOString() }] }).state, 'stale_no_recent_success');
  assert.equal(evaluate({ ...recent, last_successful_pipeline_at: '2026-10-06T00:00:00Z' }).status, 'healthy');
});

test('a failed generation is alerted even when previous generation succeeded recently', () => {
  assert.equal(evaluate({ ...recent, status: 'failed' }).state, 'latest_pipeline_failed');
  assert.equal(evaluate({ status: 'failed' }).status, 'alert');
});

test('missing and invalid heartbeat cannot masquerade as successful generation', () => {
  for (const heartbeat of [{}, null, { ...recent, last_successful_pipeline_at: null }, { ...recent, last_pipeline_run_at: 'invalid' }, { ...recent, last_pipeline_run_at: '2026-10-07T00:00:00Z' }]) {
    assert.equal(evaluate(heartbeat).status, 'unknown');
  }
  assert.equal(evaluate(recent, { authorizedSourceCount: 0 }).state, 'no_authorized_sources');
  assert.equal(evaluate(recent, { authorizedSourceCount: undefined }).state, 'unknown_source_authorization');
});

test('default monitor CLI makes no OpenRouter or Actions requests and dry-run makes no issue writes', () => {
  const directory = mkdtempSync(join(tmpdir(), 'subscription-monitor-'));
  const loader = join(directory, 'no-network.mjs');
  writeFileSync(loader, `globalThis.fetch = async (url, options = {}) => {
    if (!String(url).includes('/issues?') || (options.method || 'GET') !== 'GET') throw new Error('Unexpected network access: ' + url);
    return { ok: true, status: 200, json: async () => [] };
  };`);
  try {
    const execution = spawnSync(process.execPath, ['--import', pathToFileURL(loader).href, 'scripts/check-operations.mjs', '--dry-run'], {
      encoding: 'utf8',
      env: { ...process.env, LLM_PROVIDER: '', GITHUB_REPOSITORY: 'owner/repo', GITHUB_TOKEN: 'test-only' },
    });
    assert.equal(execution.status, 0, execution.stderr);
    const checks = execution.stdout.trim().split('\n').map((line) => JSON.parse(line));
    assert.equal(checks.length, 1);
    assert.equal(checks[0].monitor, 'content-freshness');
    assert.equal(checks[0].dryRun, true);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
