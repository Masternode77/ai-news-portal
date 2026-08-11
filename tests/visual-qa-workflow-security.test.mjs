import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const workflow = fs.readFileSync('.github/workflows/visual-qa.yml', 'utf8');
const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const packageLock = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'));
const repositoryNodeVersion = fs.readFileSync('.nvmrc', 'utf8').trim();
const environmentTemplate = fs.readFileSync('.env.example', 'utf8');

test('visual QA runs local checks without repository secrets or remote Percy code', () => {
  // Given: pull requests and manual runs execute checkout, install, build, and visual capture from candidate code.
  const percyLockEntries = Object.keys(packageLock.packages).filter((entry) => entry.includes('/@percy/'));

  // When: workflow, package, lockfile, and helper surfaces are inspected.
  // Then: no Percy token, package, command, or helper remains reachable.
  assert.doesNotMatch(workflow, /percy|PERCY_TOKEN|secrets\./i);
  assert.doesNotMatch(environmentTemplate, /percy|PERCY_TOKEN/i);
  assert.equal(packageJson.scripts['qa:visual:percy'], undefined);
  assert.equal(packageJson.devDependencies['@percy/cli'], undefined);
  assert.equal(packageLock.packages[''].devDependencies['@percy/cli'], undefined);
  assert.deepEqual(percyLockEntries, []);
  assert.equal(fs.existsSync('scripts/qa-visual-percy.mjs'), false);
});

test('visual QA workflow pins every third-party action to a reviewed commit', () => {
  // Given: the workflow executes checkout, setup-node, and artifact upload actions.
  const actionRefs = [...workflow.matchAll(/^\s+uses:\s*(?<action>actions\/(?:checkout|setup-node|upload-artifact))@(?<ref>\S+)(?:\s+#\s*(?<major>v\d+))?\s*$/gm)];

  // When: action references are inspected.
  // Then: each action uses its reviewed immutable SHA and retains the upstream major comment.
  assert.deepEqual(
    actionRefs.map(({ groups }) => [groups.action, groups.ref]),
    [
      ['actions/checkout', '11d5960a326750d5838078e36cf38b85af677262'],
      ['actions/setup-node', '49933ea5288caeca8642d1e84afbd3f7d6820020'],
      ['actions/upload-artifact', 'ea165f8d65b6e75b540449e92b4886f43607fa02'],
    ],
  );
  for (const actionRef of actionRefs) {
    assert.match(actionRef.groups.ref, /^[0-9a-f]{40}$/);
    assert.equal(actionRef.groups.major, 'v4');
  }
});

test('visual QA runtime is resolved from the committed lockfile', () => {
  // Given: local visual capture needs the Playwright CLI and its pinned Chromium revision.
  const playwrightVersion = '1.62.1';

  // When: package and workflow runtime resolution are inspected.
  // Then: exact committed Playwright is installed by npm ci and no package is installed at runtime.
  assert.equal(packageJson.devDependencies.playwright, playwrightVersion);
  assert.equal(packageLock.packages[''].devDependencies.playwright, playwrightVersion);
  assert.equal(packageLock.packages['node_modules/playwright'].version, playwrightVersion);
  assert.doesNotMatch(workflow, /npm install --no-save|npx\s+-y/);
  assert.match(workflow, /npx --no-install playwright install --with-deps chromium/);
});

test('visual QA preserves the repository runtime and local verification order', () => {
  // Given: local visual checks must finish before immutable artifact upload.
  const configuredNodeVersion = workflow.match(/^\s+node-version:\s*['"](?<version>[^'"]+)['"]\s*$/m);
  const orderedCommands = [
    'npm run build',
    'npx --no-install playwright install --with-deps chromium',
    'npm run qa:visual:capture',
    'npm run qa:visual:smoke',
    'npm run qa:visual:commercial',
    'npm run qa:visual:status',
    'actions/upload-artifact@',
  ];

  // When: runtime selection and step order are inspected.
  // Then: Node matches repository policy and all existing visual gates retain their sequence.
  assert.equal(configuredNodeVersion?.groups?.version, repositoryNodeVersion);
  let previousIndex = -1;
  for (const command of orderedCommands) {
    const commandIndex = workflow.indexOf(command);
    assert.ok(commandIndex > previousIndex, `expected ${command} after the previous visual QA step`);
    previousIndex = commandIndex;
  }
});
