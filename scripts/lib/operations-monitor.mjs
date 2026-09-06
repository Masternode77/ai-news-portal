const GITHUB_API_VERSION = '2022-11-28';

export const CONTENT_MONITOR = Object.freeze({
  key: 'content-freshness',
  title: '[Operations] Content pipeline needs attention',
});

export const BUDGET_MONITOR = Object.freeze({
  key: 'openrouter-budget',
  title: '[Operations] OpenRouter budget needs attention',
});

function validDateMs(value) {
  const timestamp = Date.parse(String(value || ''));
  return Number.isFinite(timestamp) ? timestamp : null;
}

function runCompletedMs(run) {
  return validDateMs(run?.updated_at) ?? validDateMs(run?.run_started_at) ?? validDateMs(run?.created_at);
}

function result(status, state, summary, details = {}) {
  return { status, state, summary, details };
}

export function evaluateContentOperations({
  successfulRuns = [],
  completedRuns = [],
  authorizedSourceCount,
  now = new Date(),
  staleAfterHours = 12,
} = {}) {
  if (!Number.isInteger(authorizedSourceCount) || authorizedSourceCount < 0) {
    return result('unknown', 'unknown_source_authorization', 'Authorized source availability could not be determined.');
  }
  if (authorizedSourceCount === 0) {
    return result('alert', 'no_authorized_sources', 'No source is currently authorized for text ingestion.');
  }

  const nowMs = now instanceof Date ? now.getTime() : validDateMs(now);
  const thresholdMs = Number(staleAfterHours) * 60 * 60 * 1000;
  if (!Number.isFinite(nowMs) || !Number.isFinite(thresholdMs) || thresholdMs <= 0) {
    throw new TypeError('A valid current time and positive stale threshold are required');
  }

  const latestSuccess = [...successfulRuns]
    .filter((run) => run?.conclusion === 'success' && runCompletedMs(run) !== null)
    .sort((a, b) => runCompletedMs(b) - runCompletedMs(a))[0] || null;
  const latestCompleted = [...completedRuns]
    .filter((run) => run?.status === 'completed' && runCompletedMs(run) !== null)
    .sort((a, b) => runCompletedMs(b) - runCompletedMs(a))[0] || null;

  if (!latestSuccess && !latestCompleted) {
    return result('unknown', 'unknown_no_runs', 'The Update News workflow has no completed run history.');
  }

  const successMs = latestSuccess ? runCompletedMs(latestSuccess) : null;
  const ageHours = successMs === null ? null : Math.max(0, (nowMs - successMs) / 3_600_000);
  if (successMs !== null && ageHours <= staleAfterHours) {
    return result('healthy', 'healthy', 'The content workflow has a recent successful run.', {
      ageHours,
      latestSuccess,
    });
  }

  const completedMs = latestCompleted ? runCompletedMs(latestCompleted) : null;
  const failedAfterSuccess = latestCompleted
    && latestCompleted.conclusion !== 'success'
    && (successMs === null || completedMs > successMs);
  if (failedAfterSuccess) {
    return result('alert', 'stale_after_failed_scan', 'No successful content run occurred within the threshold, and the latest completed scan failed.', {
      ageHours,
      latestSuccess,
      latestCompleted,
    });
  }

  return result('alert', 'stale_no_recent_success', 'No successful content run occurred within the threshold.', {
    ageHours,
    latestSuccess,
    latestCompleted,
  });
}

export function evaluateOpenRouterBudget({ usageMonthly, budgetUsd, warningPercent = 80 } = {}) {
  const usageProvided = usageMonthly !== null && usageMonthly !== undefined && String(usageMonthly).trim() !== '';
  const usage = Number(usageMonthly);
  const budget = Number(budgetUsd);
  const warning = Number(warningPercent);

  if (!Number.isFinite(budget) || budget <= 0) {
    return result('unknown', 'unknown_budget_not_configured', 'The monthly OpenRouter budget is not configured.');
  }
  if (!usageProvided || !Number.isFinite(usage) || usage < 0) {
    return result('unknown', 'unknown_usage', 'OpenRouter did not return a valid monthly usage value.');
  }
  if (!Number.isFinite(warning) || warning <= 0 || warning >= 100) {
    throw new TypeError('Warning percent must be greater than 0 and less than 100');
  }

  const percent = (usage / budget) * 100;
  if (percent >= 100) {
    return result('alert', 'critical_budget_reached', 'OpenRouter monthly usage reached or exceeded the configured budget.', { percent });
  }
  if (percent >= warning) {
    return result('alert', 'warning_budget_threshold', 'OpenRouter monthly usage crossed the warning threshold.', { percent, warningPercent: warning });
  }
  return result('healthy', 'healthy', 'OpenRouter monthly usage is below the warning threshold.', { percent, warningPercent: warning });
}

export function unknownResult(state, summary) {
  return result('unknown', state, summary);
}

async function responseJson(response, service) {
  if (!response.ok) {
    throw new Error(`${service} request failed with HTTP ${response.status}`);
  }
  return response.status === 204 ? null : response.json();
}

export async function fetchWorkflowRuns({ fetchImpl = fetch, repository, token, workflow = 'update-news.yml' }) {
  if (!repository || !token) throw new Error('GitHub repository and token are required');
  const base = `https://api.github.com/repos/${repository}/actions/workflows/${encodeURIComponent(workflow)}/runs`;
  const headers = {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': GITHUB_API_VERSION,
  };
  const [successResponse, completedResponse] = await Promise.all([
    fetchImpl(`${base}?branch=main&status=success&per_page=1`, { headers }),
    fetchImpl(`${base}?branch=main&status=completed&per_page=1`, { headers }),
  ]);
  const [successPayload, completedPayload] = await Promise.all([
    responseJson(successResponse, 'GitHub Actions'),
    responseJson(completedResponse, 'GitHub Actions'),
  ]);
  return {
    successfulRuns: Array.isArray(successPayload?.workflow_runs) ? successPayload.workflow_runs : [],
    completedRuns: Array.isArray(completedPayload?.workflow_runs) ? completedPayload.workflow_runs : [],
  };
}

export async function fetchOpenRouterUsage({ fetchImpl = fetch, apiKey }) {
  if (!apiKey) throw new Error('OpenRouter API key is required');
  const response = await fetchImpl('https://openrouter.ai/api/v1/key', {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  const payload = await responseJson(response, 'OpenRouter');
  return payload?.data?.usage_monthly;
}

function monitorMarker(key) {
  return `<!-- operations-monitor:${key} -->`;
}

function stateMarker(state) {
  return `<!-- operations-monitor-state:${state} -->`;
}

function runLine(run) {
  if (!run) return 'Unavailable';
  const completedAt = run.updated_at || run.run_started_at || run.created_at || 'unknown time';
  return run.html_url ? `[${completedAt}](${run.html_url})` : completedAt;
}

export function renderIssueBody(monitor, monitorResult, observedAt = new Date()) {
  const lines = [
    monitorMarker(monitor.key),
    stateMarker(monitorResult.state),
    '',
    monitorResult.summary,
    '',
    `Observed: ${new Date(observedAt).toISOString()}`,
  ];

  if (monitor.key === CONTENT_MONITOR.key) {
    if (Number.isFinite(monitorResult.details?.ageHours)) {
      lines.push(`Last successful run age: ${monitorResult.details.ageHours.toFixed(1)} hours`);
    }
    if (monitorResult.details?.latestSuccess) lines.push(`Latest success: ${runLine(monitorResult.details.latestSuccess)}`);
    if (monitorResult.details?.latestCompleted) lines.push(`Latest completed run: ${runLine(monitorResult.details.latestCompleted)}`);
  }
  if (monitor.key === BUDGET_MONITOR.key && Number.isFinite(monitorResult.details?.percent)) {
    lines.push(`Configured budget used: ${monitorResult.details.percent.toFixed(1)}%`);
  }

  lines.push('', 'This issue is maintained automatically. It is updated only when the monitor state changes.');
  return lines.join('\n');
}

function stateFromBody(body = '') {
  return String(body).match(/<!-- operations-monitor-state:([a-z0-9_-]+) -->/)?.[1] || '';
}

async function githubJson({ fetchImpl, repository, token, path, method = 'GET', body }) {
  const response = await fetchImpl(`https://api.github.com/repos/${repository}${path}`, {
    method,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': GITHUB_API_VERSION,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return responseJson(response, 'GitHub Issues');
}

export async function syncMonitorIssue({
  fetchImpl = fetch,
  repository,
  token,
  monitor,
  monitorResult,
  now = new Date(),
  dryRun = false,
}) {
  if (!repository || !token) throw new Error('GitHub repository and token are required to synchronize issues');
  const marker = monitorMarker(monitor.key);
  let existing;
  for (let page = 1; !existing; page += 1) {
    const issues = await githubJson({
      fetchImpl,
      repository,
      token,
      path: `/issues?state=all&sort=updated&direction=desc&per_page=100&page=${page}`,
    });
    if (!Array.isArray(issues)) throw new Error('GitHub Issues returned an invalid issue list');
    existing = issues.find((issue) => !issue.pull_request && String(issue.body || '').includes(marker));
    if (issues.length < 100) break;
  }
  const shouldAlert = monitorResult.status !== 'healthy';
  const body = renderIssueBody(monitor, monitorResult, now);

  if (!shouldAlert && !existing) return { action: 'none' };
  if (!shouldAlert && existing.state !== 'open') return { action: 'none', issueNumber: existing.number };
  if (!shouldAlert) {
    if (!dryRun) {
      await githubJson({
        fetchImpl,
        repository,
        token,
        path: `/issues/${existing.number}`,
        method: 'PATCH',
        body: { state: 'closed', body },
      });
    }
    return { action: 'recovered', issueNumber: existing.number };
  }

  if (!existing) {
    if (!dryRun) {
      const created = await githubJson({
        fetchImpl,
        repository,
        token,
        path: '/issues',
        method: 'POST',
        body: { title: monitor.title, body },
      });
      return { action: 'created', issueNumber: created?.number };
    }
    return { action: 'would-create' };
  }

  const previousState = stateFromBody(existing.body);
  if (existing.state === 'open' && previousState === monitorResult.state) {
    return { action: 'none', issueNumber: existing.number };
  }
  if (!dryRun) {
    await githubJson({
      fetchImpl,
      repository,
      token,
      path: `/issues/${existing.number}`,
      method: 'PATCH',
      body: { state: 'open', title: monitor.title, body },
    });
  }
  return {
    action: existing.state === 'closed' ? 'reopened' : 'updated',
    issueNumber: existing.number,
  };
}
