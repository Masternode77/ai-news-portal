import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  BUDGET_MONITOR,
  CONTENT_MONITOR,
  evaluateContentOperations,
  evaluateOpenRouterBudget,
  fetchOpenRouterUsage,
  fetchWorkflowRuns,
  renderIssueBody,
  syncMonitorIssue,
} from '../scripts/lib/operations-monitor.mjs';

const now = new Date('2026-09-06T12:00:00.000Z');

function run({ conclusion = 'success', hoursAgo = 1, id = 1 } = {}) {
  return {
    id,
    status: 'completed',
    conclusion,
    updated_at: new Date(now - hoursAgo * 3_600_000).toISOString(),
    html_url: `https://github.example/runs/${id}`,
  };
}

function jsonResponse(payload, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => payload };
}

test('content freshness is based on the latest successful workflow run', () => {
  const latestFailure = run({ conclusion: 'failure', hoursAgo: 1, id: 2 });
  const recentSuccess = run({ hoursAgo: 6, id: 1 });
  const result = evaluateContentOperations({
    successfulRuns: [recentSuccess],
    completedRuns: [latestFailure],
    authorizedSourceCount: 2,
    now,
  });
  assert.equal(result.state, 'healthy');
});

test('content monitor distinguishes failed scans, stalled success, no sources, and first-run unknown', () => {
  const oldSuccess = run({ hoursAgo: 13, id: 1 });
  assert.equal(evaluateContentOperations({
    successfulRuns: [oldSuccess],
    completedRuns: [run({ conclusion: 'failure', hoursAgo: 1, id: 2 })],
    authorizedSourceCount: 2,
    now,
  }).state, 'stale_after_failed_scan');
  assert.equal(evaluateContentOperations({
    successfulRuns: [oldSuccess], completedRuns: [oldSuccess], authorizedSourceCount: 2, now,
  }).state, 'stale_no_recent_success');
  assert.equal(evaluateContentOperations({
    successfulRuns: [oldSuccess], completedRuns: [oldSuccess], authorizedSourceCount: 0, now,
  }).state, 'no_authorized_sources');
  assert.equal(evaluateContentOperations({ authorizedSourceCount: 2, now }).state, 'unknown_no_runs');
});

test('OpenRouter budget has explicit unknown, warning, critical, and healthy states', () => {
  assert.equal(evaluateOpenRouterBudget({ usageMonthly: 0 }).state, 'unknown_budget_not_configured');
  assert.equal(evaluateOpenRouterBudget({ usageMonthly: undefined, budgetUsd: 100 }).state, 'unknown_usage');
  assert.equal(evaluateOpenRouterBudget({ usageMonthly: null, budgetUsd: 100 }).state, 'unknown_usage');
  assert.equal(evaluateOpenRouterBudget({ usageMonthly: 79, budgetUsd: 100 }).state, 'healthy');
  assert.equal(evaluateOpenRouterBudget({ usageMonthly: 80, budgetUsd: 100 }).state, 'warning_budget_threshold');
  assert.equal(evaluateOpenRouterBudget({ usageMonthly: 100, budgetUsd: 100 }).state, 'critical_budget_reached');
});

test('API readers use workflow success filtering and the documented usage_monthly field', async () => {
  const urls = [];
  const workflowFetch = async (url) => {
    urls.push(url);
    return jsonResponse({ workflow_runs: url.includes('status=success') ? [run()] : [run({ conclusion: 'failure' })] });
  };
  const snapshot = await fetchWorkflowRuns({ fetchImpl: workflowFetch, repository: 'owner/repo', token: 'token' });
  assert.equal(snapshot.successfulRuns[0].conclusion, 'success');
  assert.ok(urls.some((url) => url.includes('status=success')));
  assert.ok(urls.some((url) => url.includes('status=completed')));

  const usage = await fetchOpenRouterUsage({
    apiKey: 'secret',
    fetchImpl: async () => jsonResponse({ data: { usage_monthly: 12.5, usage: 99 } }),
  });
  assert.equal(usage, 12.5);
});

test('issue synchronization deduplicates unchanged alerts and updates only transitions', async () => {
  const body = renderIssueBody(CONTENT_MONITOR, { status: 'alert', state: 'stale_no_recent_success', summary: 'Old.' }, now);
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options });
    if (options.method === 'PATCH') return jsonResponse({ number: 7 });
    return jsonResponse([{ number: 7, state: 'open', body }]);
  };

  const unchanged = await syncMonitorIssue({
    fetchImpl, repository: 'owner/repo', token: 'token', monitor: CONTENT_MONITOR,
    monitorResult: { status: 'alert', state: 'stale_no_recent_success', summary: 'Still old.', details: {} }, now,
  });
  assert.equal(unchanged.action, 'none');
  assert.equal(calls.filter((call) => call.options.method === 'PATCH').length, 0);

  const changed = await syncMonitorIssue({
    fetchImpl, repository: 'owner/repo', token: 'token', monitor: CONTENT_MONITOR,
    monitorResult: { status: 'alert', state: 'stale_after_failed_scan', summary: 'Failed.', details: {} }, now,
  });
  assert.equal(changed.action, 'updated');
  assert.equal(calls.filter((call) => call.options.method === 'PATCH').length, 1);
});

test('issue synchronization finds an existing monitor issue beyond the first page', async () => {
  const body = renderIssueBody(CONTENT_MONITOR, {
    status: 'alert', state: 'stale_no_recent_success', summary: 'Old.', details: {},
  }, now);
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options });
    if (options.method === 'POST') throw new Error('must not create a duplicate issue');
    if (new URL(url).searchParams.get('page') === '1') {
      return jsonResponse(Array.from({ length: 100 }, (_, index) => ({
        number: index + 1,
        state: 'closed',
        body: 'Unrelated issue',
      })));
    }
    return jsonResponse([{ number: 101, state: 'open', body }]);
  };

  const outcome = await syncMonitorIssue({
    fetchImpl, repository: 'owner/repo', token: 'token', monitor: CONTENT_MONITOR,
    monitorResult: { status: 'alert', state: 'stale_no_recent_success', summary: 'Still old.', details: {} }, now,
  });

  assert.equal(outcome.action, 'none');
  assert.equal(outcome.issueNumber, 101);
  assert.equal(calls.filter((call) => (call.options.method || 'GET') === 'GET').length, 2);
  assert.ok(calls[1].url.includes('page=2'));
});

test('recovery closes and recurrence reopens the same monitor issue without new issue spam', async () => {
  let stored = {
    number: 9,
    state: 'open',
    body: renderIssueBody(BUDGET_MONITOR, { status: 'alert', state: 'warning_budget_threshold', summary: 'Warning.', details: { percent: 81 } }, now),
  };
  const methods = [];
  const fetchImpl = async (_url, options = {}) => {
    methods.push(options.method || 'GET');
    if (options.method === 'PATCH') {
      stored = { ...stored, ...JSON.parse(options.body) };
      return jsonResponse(stored);
    }
    if (options.method === 'POST') throw new Error('must not create a replacement issue');
    return jsonResponse([stored]);
  };

  const recovery = await syncMonitorIssue({
    fetchImpl, repository: 'owner/repo', token: 'token', monitor: BUDGET_MONITOR,
    monitorResult: { status: 'healthy', state: 'healthy', summary: 'Recovered.', details: { percent: 10 } }, now,
  });
  assert.equal(recovery.action, 'recovered');
  assert.equal(stored.state, 'closed');

  const recurrence = await syncMonitorIssue({
    fetchImpl, repository: 'owner/repo', token: 'token', monitor: BUDGET_MONITOR,
    monitorResult: { status: 'alert', state: 'critical_budget_reached', summary: 'Critical.', details: { percent: 101 } }, now,
  });
  assert.equal(recurrence.action, 'reopened');
  assert.equal(stored.state, 'open');
  assert.equal(methods.filter((method) => method === 'POST').length, 0);
});

test('dry-run plans an alert without creating or updating an issue', async () => {
  const methods = [];
  const outcome = await syncMonitorIssue({
    fetchImpl: async (_url, options = {}) => {
      methods.push(options.method || 'GET');
      return jsonResponse([]);
    },
    repository: 'owner/repo', token: 'token', monitor: CONTENT_MONITOR,
    monitorResult: { status: 'unknown', state: 'unknown_no_runs', summary: 'Unknown.', details: {} }, now, dryRun: true,
  });
  assert.equal(outcome.action, 'would-create');
  assert.deepEqual(methods, ['GET']);
});

test('issue bodies expose ratios and operational links without API keys or raw budget amounts', () => {
  const body = renderIssueBody(BUDGET_MONITOR, {
    status: 'alert', state: 'warning_budget_threshold', summary: 'Warning.', details: { percent: 82.345, warningPercent: 80 },
  }, now);
  assert.match(body, /82\.3%/);
  assert.doesNotMatch(body, /OPENROUTER_API_KEY|sk-or-|\$|budgetUsd|usageMonthly/);
});

test('workflow is hourly, bounded, least-privilege, and supports non-mutating dry runs', () => {
  const workflow = fs.readFileSync('.github/workflows/operations-monitor.yml', 'utf8');
  assert.match(workflow, /cron: '17 \* \* \* \*'/);
  assert.match(workflow, /timeout-minutes: 5/);
  assert.match(workflow, /actions: read/);
  assert.match(workflow, /contents: read/);
  assert.match(workflow, /issues: write/);
  assert.match(workflow, /^permissions:\n/m);
  assert.doesNotMatch(workflow, /contents: write/);
  assert.match(workflow, /OPENROUTER_MONTHLY_BUDGET_USD: \$\{\{ vars\./);
  assert.match(workflow, /--dry-run/);
  for (const match of workflow.matchAll(/uses:\s*actions\/(?:checkout|setup-node)@([^\s]+)/g)) {
    assert.match(match[1], /^[0-9a-f]{40}$/);
  }
});
