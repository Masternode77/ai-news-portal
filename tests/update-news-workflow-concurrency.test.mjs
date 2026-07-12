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

test('update-news workflow has one serialized main-writing job', () => {
  const updateNews = extractConcurrency('update-news');

  assert.equal(updateNews.group, 'ai-news-portal-main-writes');
  assert.equal(updateNews.cancelInProgress, 'false');
  assert.doesNotMatch(workflow, /^  dashboard-sync:/m);
  assert.match(extractJobBlock('update-news'), /git push origin HEAD:main/);
});
