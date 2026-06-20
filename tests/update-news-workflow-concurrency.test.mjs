import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const workflow = fs.readFileSync('.github/workflows/update-news.yml', 'utf8');

function extractJobBlock(jobName) {
  const pattern = new RegExp(`^  ${jobName}:\\n(?<body>[\\s\\S]*?)(?=^  [a-zA-Z0-9_-]+:\\n|(?![\\s\\S]))`, 'm');
  const match = workflow.match(pattern);
  assert.ok(match?.groups?.body, `expected ${jobName} job in update-news workflow`);
  return match.groups.body;
}

function extractConcurrency(jobName) {
  const job = extractJobBlock(jobName);
  const group = job.match(/^\s+group:\s*(?<group>\S+)\s*$/m);
  const cancel = job.match(/^\s+cancel-in-progress:\s*(?<cancel>\S+)\s*$/m);
  return {
    group: group?.groups?.group,
    cancelInProgress: cancel?.groups?.cancel,
  };
}

test('update-news workflow serializes every main-writing job in one queue', () => {
  // Given: both scheduled jobs can commit generated data back to main.
  const updateNews = extractConcurrency('update-news');
  const dashboardSync = extractConcurrency('dashboard-sync');

  // When: the workflow concurrency policy is inspected.
  // Then: both writers use the same non-canceling queue so generated commits cannot race into rebase conflicts.
  assert.equal(updateNews.group, 'ai-news-portal-main-writes');
  assert.equal(dashboardSync.group, updateNews.group);
  assert.equal(updateNews.cancelInProgress, 'false');
  assert.equal(dashboardSync.cancelInProgress, 'false');
});
