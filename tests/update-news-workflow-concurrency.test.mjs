import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const workflow = fs.readFileSync('.github/workflows/update-news.yml', 'utf8');
const repositoryNodeVersion = fs.readFileSync('.nvmrc', 'utf8').trim();

test('hosted news validation cannot generate, publish or consume subscription credentials', () => {
  assert.match(workflow, /contents: read/);
  assert.match(workflow, /persist-credentials: false/);
  assert.match(workflow, /LLM_PROVIDER: disabled/);
  assert.match(workflow, /PIPELINE_OFFLINE: '1'/);
  assert.doesNotMatch(workflow, /schedule:|cron:|secrets\.|contents: write|npm run pipeline|git (?:add|commit|push)|record-pipeline-heartbeat/);
  assert.match(workflow, /push:\s+branches: \[main\]/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /group: ai-news-portal-news-validation-/);
  assert.match(workflow, /cancel-in-progress: false/);
});

test('hosted validation retains the supported runtime and all publication gates', () => {
  assert.ok(workflow.includes(`node-version: '${repositoryNodeVersion}'`));
  assert.equal(JSON.parse(fs.readFileSync('package.json', 'utf8')).engines.node, '22.x');
  const commands = ['sudo apt-get install --no-install-recommends -y xsltproc', 'npm ci', 'npm run check', 'node ./scripts/audit-omo-ultra-current-state.mjs', 'npm test', 'npm run content:gate'];
  const positions = commands.map((command) => workflow.indexOf(command));
  assert.ok(positions.every((position, index) => position >= 0 && (!index || position > positions[index - 1])));
  assert.doesNotMatch(workflow, /continue-on-error: true|\|\| true/);
  assert.equal([...workflow.matchAll(/node \.\/scripts\/audit-omo-ultra-current-state\.mjs/g)].length, 2);
});

test('hosted validation pins reviewed third-party actions', () => {
  const refs = [...workflow.matchAll(/uses: (actions\/(?:checkout|setup-node))@([0-9a-f]{40}) # v4/g)].map((m) => [m[1], m[2]]);
  assert.deepEqual(refs, [
    ['actions/checkout', '11d5960a326750d5838078e36cf38b85af677262'],
    ['actions/setup-node', '49933ea5288caeca8642d1e84afbd3f7d6820020'],
  ]);
});

test('retired curation refresh cannot schedule paid API calls or change model pins', () => {
  const refresh = fs.readFileSync('.github/workflows/curation-model-refresh.yml', 'utf8');
  assert.match(refresh, /contents: read/);
  assert.doesNotMatch(refresh, /schedule:|cron:|secrets\.|git push|node .+refresh-curation-model/);
});
