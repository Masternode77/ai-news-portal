import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { runTestSuite } from '../scripts/run-test-suite.mjs';

const packageJson = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const renderedAuditCli = fs.readFileSync(
  new URL('../scripts/audit-rendered-public-output.mjs', import.meta.url),
  'utf8',
);
const adminAuditCli = fs.readFileSync(
  new URL('../scripts/audit-admin-exclusion.mjs', import.meta.url),
  'utf8',
);
const renderedContract = fs.readFileSync(
  new URL('./public-operational-pages-removal.test.mjs', import.meta.url),
  'utf8',
);

test('full test command uses the hermetic build-backed runner', () => {
  assert.equal(packageJson.scripts.test, 'node ./scripts/run-test-suite.mjs');
});

test('full test runner builds before tests and runs every editorial gate in order', async () => {
  const commands = [];
  await runTestSuite({
    trackedDiff: async () => Buffer.from('pre-existing dirty diff'),
    run: async (command, args, options) => commands.push({ command, args, options }),
    testFiles: async () => ['tests/a.test.mjs', 'tests/b.test.mjs'],
    npmCommand: 'npm-test',
    nodeCommand: 'node-test',
    buildDir: '/tmp/public-build',
  });

  assert.deepEqual(commands, [
    { command: 'npm-test', args: ['run', 'build'], options: undefined },
    {
      command: 'node-test',
      args: ['--test', 'tests/a.test.mjs', 'tests/b.test.mjs'],
      options: { env: { PUBLIC_BUILD_DIR: '/tmp/public-build' } },
    },
    { command: 'npm-test', args: ['run', 'test:quality-gate'], options: undefined },
    { command: 'npm-test', args: ['run', 'test:relevance'], options: undefined },
    { command: 'npm-test', args: ['run', 'test:taxonomy'], options: undefined },
    { command: 'npm-test', args: ['run', 'test:repetition'], options: undefined },
  ]);
});

test('full test runner accepts an unchanged dirty worktree', async () => {
  const dirty = Buffer.from('existing local edits');
  await runTestSuite({
    trackedDiff: async () => dirty,
    run: async () => {},
    testFiles: async () => [],
  });
});

test('full test runner rejects a new tracked mutation', async () => {
  const snapshots = [Buffer.from('before'), Buffer.from('after')];
  await assert.rejects(
    runTestSuite({
      trackedDiff: async () => snapshots.shift(),
      run: async () => {},
      testFiles: async () => [],
    }),
    /Tracked files changed during npm test/,
  );
});

test('rendered public audit writes a report only when explicitly requested', () => {
  assert.match(renderedAuditCli, /parseArgs/);
  assert.match(renderedAuditCli, /values\.out/);
  assert.doesNotMatch(renderedAuditCli, /reportPath:\s*renderedOutputReportPath/);
  assert.doesNotMatch(packageJson.scripts['audit:public'], /--out/);
});

test('admin exclusion audit writes a report only when explicitly requested', () => {
  assert.match(adminAuditCli, /parseArgs/);
  assert.match(adminAuditCli, /values\.out/);
  assert.doesNotMatch(adminAuditCli, /reportPath:\s*DEFAULT_REPORT_PATH/);
  assert.doesNotMatch(packageJson.scripts['audit:admin'], /--out/);
});

test('rendered build contract cannot be skipped', () => {
  assert.doesNotMatch(renderedContract, /skip\s*:/);
  assert.match(renderedContract, /PUBLIC_BUILD_DIR/);
  assert.match(renderedContract, /build directory must exist/i);
});
