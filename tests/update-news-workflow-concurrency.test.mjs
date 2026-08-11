import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const workflow = fs.readFileSync('.github/workflows/update-news.yml', 'utf8');
const repositoryNodeVersion = fs.readFileSync('.nvmrc', 'utf8').trim();
const packageNodeEngine = JSON.parse(fs.readFileSync('package.json', 'utf8')).engines.node;
const publicationStep = workflow.match(/- name: Commit and push updates\n\s+run: \|\n(?<script>[\s\S]*)$/m);

assert.ok(publicationStep?.groups?.script, 'expected commit and push step in update-news workflow');
const publicationScript = publicationStep.groups.script;

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

test('update-news workflow uses one non-canceling writer queue without a dashboard sync job', () => {
  // Given: the scheduled workflow can commit generated public artifacts.
  const updateNews = extractConcurrency('update-news');

  // When: the workflow concurrency policy is inspected.
  // Then: the remaining writer retains the non-canceling queue and no retired dashboard writer remains.
  assert.equal(updateNews.group, 'ai-news-portal-main-writes');
  assert.equal(updateNews.cancelInProgress, 'false');
  assert.doesNotMatch(workflow, /^  dashboard-sync:/m);
});

test('update-news workflow uses the repository Node runtime', () => {
  // Given: the repository pins the supported Node 22 runtime in .nvmrc.
  const configuredNodeVersion = workflow.match(/^\s+node-version:\s*['"](?<version>[^'"]+)['"]\s*$/m);

  // When: the scheduled workflow runtime is inspected.
  // Then: setup-node uses the same explicit runtime as local and the package policy stays on Node 22.
  assert.equal(configuredNodeVersion?.groups?.version, repositoryNodeVersion);
  assert.match(repositoryNodeVersion, /^22\./);
  assert.equal(packageNodeEngine, '22.x');
});

test('update-news workflow fails closed when candidate staging fails', () => {
  // Given: the publication script stages the generated candidate tree.
  assert.match(publicationScript, /\bgit add\b/);

  // When: staging error handling is inspected.
  // Then: no shell fallback converts a failed git add into success.
  assert.doesNotMatch(publicationScript, /\bgit add\b[\s\S]*?\|\|\s*true/);
});

test('update-news workflow aborts a push race without rewriting the validated candidate', () => {
  // Given: the publication script commits the candidate after validation.
  const pushes = publicationScript.match(/\bgit push\b/g) ?? [];

  // When: the commands after candidate commit are inspected.
  // Then: one direct push is attempted and no Git operation can rewrite the committed tree.
  assert.equal(pushes.length, 1);
  assert.doesNotMatch(publicationScript, /\bgit (?:pull|rebase|merge|checkout|reset|cherry-pick|am)\b|--autostash/);
  assert.match(publicationScript, /git commit -m [^\n]+\n\s+git push origin HEAD:main\s*$/);
});

test('update-news workflow pins third-party actions to reviewed commits', () => {
  // Given: checkout and setup-node execute third-party code in the writer job.
  const actionRefs = [...workflow.matchAll(/^\s+uses:\s*(?<action>actions\/(?:checkout|setup-node))@(?<ref>\S+)(?:\s+#\s*(?<major>v\d+))?\s*$/gm)];

  // When: the action references are inspected.
  // Then: both use immutable full commit SHAs while retaining the reviewed major-version comment.
  assert.equal(actionRefs.length, 2);
  assert.deepEqual(
    actionRefs.map(({ groups }) => [groups.action, groups.ref]),
    [
      ['actions/checkout', '11d5960a326750d5838078e36cf38b85af677262'],
      ['actions/setup-node', '49933ea5288caeca8642d1e84afbd3f7d6820020'],
    ],
  );
  for (const actionRef of actionRefs) {
    assert.match(actionRef.groups.ref, /^[0-9a-f]{40}$/);
    assert.equal(actionRef.groups.major, 'v4');
  }
});

test('update-news workflow regenerates taxonomy and passes fail-closed gates before commit', () => {
  // Given: the complete scheduled workflow source.
  const taxonomy = workflow.indexOf('npm run rebuild:taxonomy-pages');
  const tests = workflow.indexOf('npm test');
  const contentGate = workflow.indexOf('npm run content:gate');
  const heartbeat = workflow.indexOf('node ./scripts/record-pipeline-heartbeat.mjs ok');
  const commit = workflow.indexOf('git commit -m');
  const push = workflow.indexOf('git push origin HEAD:main');

  // When: generation and publication steps are ordered.
  // Then: taxonomy, tests, and the production content gate all finish before Git writes.
  assert.ok(taxonomy > -1, 'expected taxonomy regeneration');
  assert.ok(tests > taxonomy, 'full test suite must follow taxonomy regeneration');
  assert.ok(contentGate > tests, 'content gate must follow the full test suite');
  assert.ok(heartbeat > contentGate, 'successful heartbeat must follow the content gate');
  assert.ok(commit > heartbeat, 'commit must follow the successful heartbeat');
  assert.ok(push > commit, 'push must follow commit');
  assert.match(workflow, /src\/data\/taxonomy-pages\.json/);
  assert.match(workflow, /src\/data\/pipeline-heartbeat\.json/);
});
