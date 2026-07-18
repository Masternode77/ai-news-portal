import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const workflow = fs.readFileSync('.github/workflows/visual-qa.yml', 'utf8');
const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const packageLock = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'));

test('visual QA scopes Percy credentials to the snapshot step', () => {
  assert.doesNotMatch(workflow, /^\s{4}env:\s*\n\s+PERCY_TOKEN:/m);
  assert.match(
    workflow,
    /- name: Percy snapshot[\s\S]*?if: \$\{\{ github\.event_name == 'workflow_dispatch' && github\.ref == 'refs\/heads\/main' \}\}[\s\S]*?env:\s*\n\s+PERCY_TOKEN: \$\{\{ secrets\.PERCY_TOKEN \}\}/,
  );
  assert.doesNotMatch(
    workflow,
    /- name: Percy snapshot[\s\S]*?if:.*pull_request/,
  );
});

test('visual QA uses lockfile-installed browser tooling', () => {
  assert.equal(packageJson.devDependencies.playwright, '1.61.1');
  assert.equal(packageJson.devDependencies['@percy/cli'], '1.31.14');
  assert.equal(packageLock.packages[''].devDependencies.playwright, '1.61.1');
  assert.equal(packageLock.packages[''].devDependencies['@percy/cli'], '1.31.14');
  assert.doesNotMatch(workflow, /npm install --no-save/);
  assert.match(workflow, /npx --no-install playwright install --with-deps chromium/);
});
