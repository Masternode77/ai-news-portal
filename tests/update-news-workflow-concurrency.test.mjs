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

test('update-news workflow restores and preserves cycle checkpoints and publication receipts', () => {
  const job = extractJobBlock('update-news');
  assert.match(job, /uses: actions\/cache\/restore@0057852bfaa89a56745cba8c7296529d2fc39830 # v4\.3\.0/);
  assert.match(job, /path: \.cache\/content-cycle(?:\s|$)/);
  assert.match(job, /restore-keys:\s*\|[\s\S]*content-cycle-v2-\$\{\{ runner\.os \}\}-\$\{\{ github\.ref_name \}\}-/);
  assert.match(job, /if: always\(\)[\s\S]*uses: actions\/cache\/save@0057852bfaa89a56745cba8c7296529d2fc39830 # v4\.3\.0/);
});

test('update-news workflow verifies source-image provenance after the production build', () => {
  const buildIndex = workflow.indexOf('run: npm run build');
  const provenanceIndex = workflow.indexOf('run: npm run audit:source-image-provenance');
  const commitIndex = workflow.indexOf('- name: Commit and push updates');

  assert.ok(buildIndex >= 0);
  assert.ok(provenanceIndex > buildIndex);
  assert.ok(commitIndex > provenanceIndex);
});
