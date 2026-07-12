import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import test from 'node:test';

const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const workflow = fs.readFileSync(new URL('../.github/workflows/update-news.yml', import.meta.url), 'utf8');
const canonicalScript = fs.readFileSync(new URL('../scripts/content-command-surface.mjs', import.meta.url), 'utf8');

const canonicalEntrypoint = 'node ./scripts/content-command-surface.mjs';
const contentCommands = [
  'content:ingest',
  'content:extract',
  'content:classify',
  'content:cluster',
  'content:generate',
  'content:review',
  'content:publish',
  'content:cycle',
  'content:eval',
];

test('package exposes the canonical content command surface', () => {
  for (const command of contentCommands) {
    assert.ok(pkg.scripts[command], `missing ${command}`);
    assert.match(pkg.scripts[command], /content-command-surface\.mjs/, `${command} must use canonical CLI`);
  }

  assert.ok(pkg.scripts.test, 'missing test command');
  assert.ok(pkg.scripts.build, 'missing build command');
  assert.ok(pkg.scripts['audit:public'], 'missing audit:public command');
  assert.ok(pkg.scripts['audit:production'], 'missing audit:production command');
  assert.match(pkg.scripts['audit:production'], /--skip-cache-purge/);
});

test('legacy pipeline npm script is a compatibility wrapper to canonical production cycle', () => {
  assert.equal(pkg.scripts.pipeline, `${canonicalEntrypoint} cycle --production`);
  assert.doesNotMatch(pkg.scripts['content:cycle'], /--fixture\s/);
  assert.doesNotMatch(pkg.scripts['content:cycle'], /\.cache\/content-cycle/);
});

test('canonical CLI is the shared phase entrypoint over the core orchestrator phase list', () => {
  assert.match(canonicalScript, /ORCHESTRATOR_PHASES/);
  assert.match(canonicalScript, /CONTENT_PHASES/);
  assert.match(canonicalScript, /scripts\/pipeline\.mjs/);
  assert.match(canonicalScript, /scripts\/eval-article-generation\.mjs/);
});

test('isolated phase commands fail closed instead of reporting no-op success', () => {
  const result = spawnSync(process.execPath, ['scripts/content-command-surface.mjs', 'ingest'], {
    cwd: new URL('..', import.meta.url),
    encoding: 'utf8',
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /content:ingest failed closed/);
  assert.match(result.stderr, /npm run content:cycle/);
  assert.equal(result.stdout, '');
});

test('canonical CLI help remains successful', () => {
  const result = spawnSync(process.execPath, ['scripts/content-command-surface.mjs', '--help'], {
    cwd: new URL('..', import.meta.url),
    encoding: 'utf8',
  });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /Usage: node scripts\/content-command-surface\.mjs/);
  assert.equal(result.stderr, '');
});

test('cycle requires an explicit production boundary', () => {
  const result = spawnSync(process.execPath, ['scripts/content-command-surface.mjs', 'cycle'], {
    cwd: new URL('..', import.meta.url),
    encoding: 'utf8',
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /requires exactly one argument: --production/);
  assert.equal(result.stdout, '');
});

test('cycle rejects legacy fixture arguments instead of discarding them into production', () => {
  const direct = spawnSync(
    process.execPath,
    ['scripts/content-command-surface.mjs', 'cycle', '--production', '--fixture', 'tests/fixtures/content-cycle-mixed.json'],
    { cwd: new URL('..', import.meta.url), encoding: 'utf8' },
  );
  assert.notEqual(direct.status, 0);
  assert.match(direct.stderr, /requires exactly one argument: --production/);

  const throughNpm = spawnSync(
    'npm',
    ['run', 'content:cycle', '--', '--fixture', 'tests/fixtures/content-cycle-mixed.json'],
    { cwd: new URL('..', import.meta.url), encoding: 'utf8' },
  );
  assert.notEqual(throughNpm.status, 0);
  assert.match(`${throughNpm.stdout}\n${throughNpm.stderr}`, /requires exactly one argument: --production/);
});

test('production workflow uses canonical cycle and reserves skip ci for dashboard-only commits', () => {
  assert.match(workflow, /run:\s+npm run content:cycle/);
  assert.doesNotMatch(workflow, /run:\s+npm run pipeline/);
  assert.match(workflow, /changed_files="\$\(git diff --cached --name-only\)"/);
  assert.match(workflow, /refresh news surface and archive"/);
  assert.match(workflow, /refresh dashboard state \[skip ci\]"/);
});
