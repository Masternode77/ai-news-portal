import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  assertSafeReceiptPath,
  classifyIntegrationPath,
  parseArgs,
  renderIntegrationAudit,
  runUpstreamIntegrationAudit,
  writeReceipt,
} from '../scripts/audit-upstream-integration.mjs';

function git(root, args) {
  return String(execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })).trim();
}

async function write(root, relativePath, content) {
  const target = path.join(root, relativePath);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content);
}

async function commit(root, message) {
  git(root, ['add', '-A']);
  git(root, ['commit', '-m', message]);
  return git(root, ['rev-parse', 'HEAD']);
}

async function installExecutableAudit(root) {
  await fs.mkdir(path.join(root, 'scripts'), { recursive: true });
  await Promise.all([
    fs.copyFile(
      new URL('../scripts/audit-upstream-integration.mjs', import.meta.url),
      path.join(root, 'scripts/audit-upstream-integration.mjs'),
    ),
    fs.mkdir(path.join(root, 'scripts/lib'), { recursive: true }).then(() => fs.copyFile(
      new URL('../scripts/lib/safe-git-revision.mjs', import.meta.url),
      path.join(root, 'scripts/lib/safe-git-revision.mjs'),
    )),
  ]);
}

function executeAudit(root, args) {
  return spawnSync(process.execPath, ['scripts/audit-upstream-integration.mjs', ...args], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

async function fixtureRepository() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'compute-current-integration-test-'));
  git(root, ['init', '-q']);
  git(root, ['config', 'user.name', 'Compute Current Test']);
  git(root, ['config', 'user.email', 'test@example.invalid']);
  await write(root, 'src/data/latest-news.json', '[\n  "base"\n]\n');
  await write(root, 'public/dashboard-data.json', '{"state":"base"}\n');
  await write(root, 'public/generated/example.webp', Buffer.from([0, 1, 2, 3]));
  await write(root, 'clean-overlap.txt', 'one\ntwo\nthree\n');
  await write(root, 'ours-only.txt', 'base\n');
  await write(root, '.gitattributes', 'union.txt merge=union\n');
  await write(root, 'union.txt', 'base\n');
  const base = await commit(root, 'base');

  git(root, ['switch', '-q', '-c', 'ours']);
  await write(root, 'src/data/latest-news.json', '[\n  "ours"\n]\n');
  await fs.rm(path.join(root, 'public/dashboard-data.json'));
  await write(root, 'public/generated/example.webp', Buffer.from([0, 4, 2, 3]));
  await write(root, 'clean-overlap.txt', 'ONE\ntwo\nthree\n');
  await write(root, 'ours-only.txt', 'ours\n');
  await write(root, 'structural/path.txt', 'ours directory\n');
  await write(root, 'union.txt', 'ours\n');
  const ours = await commit(root, 'ours');

  git(root, ['switch', '-q', '-c', 'theirs', base]);
  await write(root, 'src/data/latest-news.json', '[\n  "theirs"\n]\n');
  await write(root, 'public/dashboard-data.json', '{"state":"theirs"}\n');
  await write(root, 'public/generated/example.webp', Buffer.from([0, 5, 2, 3]));
  await write(root, 'clean-overlap.txt', 'one\ntwo\nTHREE\n');
  await write(root, 'theirs-only.txt', 'theirs\n');
  await write(root, 'structural', 'theirs file\n');
  await write(root, 'union.txt', 'theirs\n');
  const theirs = await commit(root, 'theirs');
  git(root, ['switch', '-q', 'ours']);
  assert.equal(git(root, ['rev-parse', 'HEAD']), ours);
  return { root, theirs };
}

test('integration audit arguments and path classification fail closed', () => {
  assert.deepEqual(parseArgs([
    '--revision=origin/main',
    '--out',
    'docs/integration.md',
    '--json',
    'artifacts/receipt.json',
  ]), {
    revision: 'origin/main',
    out: 'docs/integration.md',
    json: 'artifacts/receipt.json',
    help: false,
  });
  assert.throws(() => parseArgs(['--revision', '../../unsafe']), /unsafe revision/);
  assert.throws(() => parseArgs(['--revision']), /missing value/);
  assert.throws(() => parseArgs(['--out', '../package.json']), /unsafe receipt path/);
  assert.throws(() => parseArgs(['--out', 'docs/report.json']), /unsafe receipt path/);
  assert.throws(() => parseArgs(['--json', 'src/data/report.json']), /unsafe receipt path/);
  assert.throws(() => parseArgs(['--json=/tmp/report.json']), /unsafe receipt path/);
  assert.throws(() => parseArgs(['--out', 'docs/fake\nheading.md']), /unsafe receipt path/);
  assert.throws(() => parseArgs(['--out', 'docs/fake`code.md']), /unsafe receipt path/);
  assert.throws(() => parseArgs(['--apply']), /unknown argument/);
  assert.throws(() => assertSafeReceiptPath('docs/report.md', 'unknown'), /unknown receipt kind/);
  assert.equal(assertSafeReceiptPath('docs/report.md', 'markdown'), 'docs/report.md');
  assert.equal(assertSafeReceiptPath('artifacts/report.json', 'json'), 'artifacts/report.json');
  assert.equal(classifyIntegrationPath('public/dashboard-data.json'), 'retired-runtime-artifact');
  assert.equal(classifyIntegrationPath('public/generated/example.webp'), 'generated-image');
  assert.equal(classifyIntegrationPath('src/data/search-index.json'), 'generated-data-projection');
  assert.equal(classifyIntegrationPath('src/pages/index.astro'), 'source-or-config');
});

test('integration audit identifies real conflicts without repository or worktree writes', async (t) => {
  const fixture = await fixtureRepository();
  t.after(() => fs.rm(fixture.root, { recursive: true, force: true }));
  const objectsBefore = git(fixture.root, ['count-objects', '-v']);
  const statusBefore = git(fixture.root, ['status', '--porcelain=v1']);

  const report = await runUpstreamIntegrationAudit({ revision: fixture.theirs }, { root: fixture.root });

  assert.equal(report.integrationReady, false);
  assert.equal(report.rawGeneratedMergeAllowed, false);
  assert.equal(report.overlappingPathCount, 5);
  assert.equal(report.conflictCount >= 4, true);
  assert.equal(report.cleanOverlapCount, 2);
  assert.equal(report.unexpectedConflictCount >= 1, true);
  assert.deepEqual(
    report.conflicts
      .filter(({ filePath }) => !filePath.startsWith('structural'))
      .map(({ filePath, reason, category }) => ({ filePath, reason, category })),
    [
      {
        filePath: 'public/dashboard-data.json',
        reason: 'modify-delete',
        category: 'retired-runtime-artifact',
      },
      {
        filePath: 'public/generated/example.webp',
        reason: 'binary-content',
        category: 'generated-image',
      },
      {
        filePath: 'src/data/latest-news.json',
        reason: 'content',
        category: 'generated-data-projection',
      },
    ],
  );
  assert.equal(report.repositoryObjectWrites, false);
  assert.equal(report.temporaryObjectWrites, true);
  assert.equal(report.mergeWorkingTreeWrites, false);
  assert.equal(report.workingTreeWrites, false);
  assert.equal(report.receiptWorkingTreeWrites, 0);
  assert.equal(report.temporaryFilesCleaned, true);
  assert.equal(report.nativeMergeClean, false);
  assert.equal(report.conflicts.some((item) => (
    item.filePath.startsWith('structural') && item.reason === 'native-merge-conflict'
  )), true);
  assert.equal(report.conflicts.some((item) => item.filePath === 'union.txt'), false);
  const markdown = renderIntegrationAudit(report);
  for (const heading of [
    '## Commands Run',
    '## Artifacts',
    '## Pass/Fail',
    '## Remaining Risks',
    '## Cleanup Receipts',
  ]) {
    assert.match(markdown, new RegExp(heading));
  }
  assert.match(markdown, /Repository Git object database writes: none/);
  assert.match(markdown, /Merge-simulation working-tree writes: none/);

  await write(fixture.root, 'dirty-uncommitted.txt', 'not audited\n');
  await assert.rejects(
    runUpstreamIntegrationAudit({ revision: fixture.theirs }, { root: fixture.root }),
    /working tree contains unaudited changes/,
  );
  await fs.rm(path.join(fixture.root, 'dirty-uncommitted.txt'));
  assert.equal(git(fixture.root, ['count-objects', '-v']), objectsBefore);
  assert.equal(git(fixture.root, ['status', '--porcelain=v1']), statusBefore);
});

test('receipt writer refuses symlink escapes and writes only inside the allowed base', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'compute-current-receipt-test-'));
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'compute-current-receipt-outside-'));
  t.after(() => Promise.all([
    fs.rm(root, { recursive: true, force: true }),
    fs.rm(outside, { recursive: true, force: true }),
  ]));
  await fs.mkdir(path.join(root, 'docs'));
  await writeReceipt('docs/report.md', '# Safe\n', 'markdown', root);
  assert.equal(await fs.readFile(path.join(root, 'docs/report.md'), 'utf8'), '# Safe\n');
  await writeReceipt('artifacts/fresh-run/report.json', '{}\n', 'json', root);
  assert.equal(await fs.readFile(path.join(root, 'artifacts/fresh-run/report.json'), 'utf8'), '{}\n');

  await fs.symlink(outside, path.join(root, 'docs/escape'));
  await assert.rejects(
    writeReceipt('docs/escape/report.md', '# Escaped\n', 'markdown', root),
    /unsafe receipt directory|receipt path escapes/,
  );
  const outsideTarget = path.join(outside, 'target.md');
  await fs.writeFile(outsideTarget, 'outside\n');
  await fs.symlink(outsideTarget, path.join(root, 'docs/link.md'));
  await assert.rejects(
    writeReceipt('docs/link.md', '# Replaced\n', 'markdown', root),
    /unsafe receipt target/,
  );
  assert.equal(await fs.readFile(outsideTarget, 'utf8'), 'outside\n');
});

test('executable CLI returns native merge status, reports failures, and writes receipts', async (t) => {
  const fixture = await fixtureRepository();
  t.after(() => fs.rm(fixture.root, { recursive: true, force: true }));
  await installExecutableAudit(fixture.root);
  await commit(fixture.root, 'install audit executable');
  const head = git(fixture.root, ['rev-parse', 'HEAD']);
  const clean = executeAudit(fixture.root, ['--revision', head]);
  assert.equal(clean.status, 0, clean.stderr);
  assert.equal(clean.stderr, '');

  const invalid = executeAudit(fixture.root, ['--apply']);
  assert.equal(invalid.status, 1);
  assert.match(invalid.stderr, /upstream integration audit failed: unknown argument: --apply/);

  const conflict = executeAudit(fixture.root, [
    '--revision',
    fixture.theirs,
    '--out',
    'docs/conflict.md',
    '--json',
    'artifacts/fresh/conflict.json',
  ]);
  assert.equal(conflict.status, 1, conflict.stderr);
  assert.equal(conflict.stderr, '');
  assert.match(await fs.readFile(path.join(fixture.root, 'docs/conflict.md'), 'utf8'), /Conflicts: 4/);
  const json = JSON.parse(await fs.readFile(
    path.join(fixture.root, 'artifacts/fresh/conflict.json'),
    'utf8',
  ));
  assert.equal(json.integrationReady, false);
  assert.equal(json.workingTreeWrites, true);
  assert.equal(json.receiptWorkingTreeWrites, 2);
});

test('native Git remains authoritative across multiple merge bases', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'compute-current-criss-cross-test-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  git(root, ['init', '-q']);
  git(root, ['config', 'user.name', 'Compute Current Test']);
  git(root, ['config', 'user.email', 'test@example.invalid']);
  await write(root, 'base.txt', 'base\n');
  const base = await commit(root, 'base');
  git(root, ['switch', '-q', '-c', 'left']);
  await write(root, 'left.txt', 'left\n');
  const left = await commit(root, 'left');
  git(root, ['switch', '-q', '-c', 'right', base]);
  await write(root, 'right.txt', 'right\n');
  const right = await commit(root, 'right');
  git(root, ['switch', '-q', 'left']);
  git(root, ['merge', '--no-ff', '-m', 'merge left right', right]);
  const firstTip = git(root, ['rev-parse', 'HEAD']);
  const tree = git(root, ['rev-parse', `${firstTip}^{tree}`]);
  const secondTip = String(execFileSync(
    'git',
    ['commit-tree', tree, '-p', right, '-p', left],
    {
      cwd: root,
      encoding: 'utf8',
      input: 'merge right left\n',
      stdio: ['pipe', 'pipe', 'pipe'],
    },
  )).trim();
  assert.equal(git(root, ['merge-base', '--all', firstTip, secondTip]).split('\n').length, 2);
  const report = await runUpstreamIntegrationAudit({ revision: secondTip }, { root });
  assert.equal(report.integrationReady, true);
  assert.equal(report.conflictCount, 0);
});
