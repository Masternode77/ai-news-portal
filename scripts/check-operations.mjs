import { activeRegistryFeeds, loadSourceRegistry } from './lib/source-registry.mjs';
import {
  BUDGET_MONITOR,
  CONTENT_MONITOR,
  evaluateContentOperations,
  evaluateOpenRouterBudget,
  fetchOpenRouterUsage,
  fetchWorkflowRuns,
  syncMonitorIssue,
  unknownResult,
} from './lib/operations-monitor.mjs';

const dryRun = process.argv.includes('--dry-run');
const repository = process.env.GITHUB_REPOSITORY || '';
const githubToken = process.env.GITHUB_TOKEN || '';
const now = new Date();
let encounteredOperationalError = false;

async function contentResult() {
  try {
    const sources = await loadSourceRegistry();
    const authorizedSourceCount = activeRegistryFeeds(sources, now).length;
    const snapshot = await fetchWorkflowRuns({ repository, token: githubToken });
    return evaluateContentOperations({ ...snapshot, authorizedSourceCount, now, staleAfterHours: 12 });
  } catch (error) {
    encounteredOperationalError = true;
    console.error(`content monitor error: ${error.message}`);
    return unknownResult('unknown_content_monitor_error', 'The content monitor could not retrieve current workflow health.');
  }
}

async function budgetResult() {
  const budgetUsd = process.env.OPENROUTER_MONTHLY_BUDGET_USD;
  const warningPercent = process.env.OPENROUTER_BUDGET_WARNING_PERCENT || 80;
  if (!budgetUsd) {
    return unknownResult('unknown_budget_not_configured', 'The monthly OpenRouter budget is not configured.');
  }
  if (!process.env.OPENROUTER_API_KEY) {
    return unknownResult('unknown_openrouter_credentials', 'OpenRouter usage credentials are not configured.');
  }
  try {
    const usageMonthly = await fetchOpenRouterUsage({ apiKey: process.env.OPENROUTER_API_KEY });
    return evaluateOpenRouterBudget({ usageMonthly, budgetUsd, warningPercent });
  } catch (error) {
    encounteredOperationalError = true;
    console.error(`budget monitor error: ${error.message}`);
    return unknownResult('unknown_openrouter_api_error', 'The OpenRouter usage API could not be read.');
  }
}

const checks = await Promise.all([
  contentResult().then((monitorResult) => ({ monitor: CONTENT_MONITOR, monitorResult })),
  budgetResult().then((monitorResult) => ({ monitor: BUDGET_MONITOR, monitorResult })),
]);

for (const check of checks) {
  let issue = { action: 'not-synchronized' };
  try {
    if (repository && githubToken) {
      issue = await syncMonitorIssue({
        repository,
        token: githubToken,
        monitor: check.monitor,
        monitorResult: check.monitorResult,
        now,
        dryRun,
      });
    } else {
      encounteredOperationalError = true;
      console.error(`${check.monitor.key} issue sync error: GitHub repository or token is missing`);
    }
  } catch (error) {
    encounteredOperationalError = true;
    console.error(`${check.monitor.key} issue sync error: ${error.message}`);
  }
  console.log(JSON.stringify({
    monitor: check.monitor.key,
    status: check.monitorResult.status,
    state: check.monitorResult.state,
    issueAction: issue.action,
    dryRun,
  }));
}

if (encounteredOperationalError) process.exitCode = 1;
