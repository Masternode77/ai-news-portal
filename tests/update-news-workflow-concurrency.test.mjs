import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const workflow = fs.readFileSync('.github/workflows/update-news.yml', 'utf8');
const repositoryNodeVersion = fs.readFileSync('.nvmrc', 'utf8').trim();

test('hosted application validation covers pull requests and every main change without generation credentials', () => {
  assert.match(workflow, /contents: read/);
  assert.match(workflow, /persist-credentials: false/);
  assert.match(workflow, /LLM_PROVIDER: disabled/);
  assert.match(workflow, /PIPELINE_OFFLINE: '1'/);
  assert.doesNotMatch(workflow, /schedule:|cron:|secrets\.|contents: write|npm run pipeline|git (?:add|commit|push)|record-pipeline-heartbeat/);
  assert.match(workflow, /push:\s+branches: \[main\]/);
  assert.match(workflow, /pull_request:\s+branches: \[main\]/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /^\s+paths:/m);
  assert.match(workflow, /group: ai-news-portal-application-validation-/);
  assert.match(workflow, /cancel-in-progress: false/);
});

test('hosted validation retains the supported runtime and all publication gates without rebuilding twice', () => {
  assert.ok(workflow.includes(`node-version: '${repositoryNodeVersion}'`));
  assert.equal(JSON.parse(fs.readFileSync('package.json', 'utf8')).engines.node, '22.x');
  const commands = ['sudo apt-get install --no-install-recommends -y xsltproc', 'npm ci', 'npm audit --omit=dev --audit-level=high', 'npm run check', 'node ./scripts/audit-omo-ultra-current-state.mjs', 'npm test', 'npm run content:gate:built'];
  const positions = commands.map((command) => workflow.indexOf(command));
  assert.ok(positions.every((position, index) => position >= 0 && (!index || position > positions[index - 1])));
  assert.doesNotMatch(workflow, /continue-on-error: true|\|\| true/);
  assert.equal([...workflow.matchAll(/node \.\/scripts\/audit-omo-ultra-current-state\.mjs/g)].length, 2);
});

test('only the mocked-network full test step enables source adapters', () => {
  const fullTestStep = workflow.match(/      - name: Run full test suite\n[\s\S]*?(?=\n      - name:)/)?.[0] || '';
  assert.match(fullTestStep, /env:\n\s+PIPELINE_OFFLINE: '0'\n\s+run: npm test/);
  assert.match(fullTestStep, /LLM_PROVIDER remains disabled, so no model can run/);
  assert.doesNotMatch(workflow.replace(fullTestStep, ''), /PIPELINE_OFFLINE: '0'/);
  assert.match(workflow, /env:\n\s+LLM_PROVIDER: disabled\n\s+PIPELINE_OFFLINE: '1'/);
  assert.doesNotMatch(fullTestStep, /^\s+LLM_PROVIDER:/m);
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
