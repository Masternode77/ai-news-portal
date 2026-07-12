import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  changedPathsFromGit,
  gitComparison,
  shouldIgnoreVercelBuild,
} from '../scripts/vercel-ignore-build.mjs';

const root = path.resolve(import.meta.dirname, '..');

test('Vercel ignores only dashboard and pipeline state commits', () => {
  assert.equal(shouldIgnoreVercelBuild(['public/dashboard-data.json']), true);
  assert.equal(shouldIgnoreVercelBuild(['scripts/state/pipeline-state.json']), true);
  assert.equal(shouldIgnoreVercelBuild([
    'public/dashboard-data.json',
    'scripts/state/pipeline-state.json',
  ]), true);
});

test('Vercel builds product, content, mixed, and indeterminate changes', () => {
  assert.equal(shouldIgnoreVercelBuild([]), false);
  assert.equal(shouldIgnoreVercelBuild(['src/pages/index.astro']), false);
  assert.equal(shouldIgnoreVercelBuild(['src/data/latest-news.json']), false);
  assert.equal(shouldIgnoreVercelBuild([
    'scripts/state/pipeline-state.json',
    'src/data/latest-news.json',
  ]), false);
});

test('Vercel compares the last successful deployment to the current commit and fails open', () => {
  const previousSha = '1'.repeat(40);
  const commitSha = '2'.repeat(40);
  assert.deepEqual(gitComparison({
    VERCEL: '1',
    VERCEL_GIT_PREVIOUS_SHA: previousSha,
    VERCEL_GIT_COMMIT_SHA: commitSha,
  }), [previousSha, commitSha]);
  assert.equal(gitComparison({ VERCEL: '1' }), null);
  assert.equal(gitComparison({
    VERCEL: '1',
    VERCEL_GIT_PREVIOUS_SHA: 'not-a-sha',
    VERCEL_GIT_COMMIT_SHA: commitSha,
  }), null);
});

test('a state-only tip cannot hide content changes since the last successful deployment', (t) => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'vercel-ignore-build-'));
  t.after(() => fs.rmSync(repo, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd: repo, stdio: 'ignore' });
  const write = (relativePath, value) => {
    const filePath = path.join(repo, relativePath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, value);
  };

  git('init');
  git('config', 'user.name', 'Compute Current Test');
  git('config', 'user.email', 'test@computecurrent.invalid');
  write('README.md', 'baseline\n');
  git('add', '.');
  git('commit', '-m', 'baseline');
  const previousSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim();

  write('src/data/latest-news.json', '[]\n');
  git('add', '.');
  git('commit', '-m', 'content');
  write('scripts/state/pipeline-state.json', '{}\n');
  git('add', '.');
  git('commit', '-m', 'state');
  const commitSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim();

  const tipOnly = execFileSync('git', ['diff', '--name-only', 'HEAD^', 'HEAD'], {
    cwd: repo,
    encoding: 'utf8',
  }).trim().split('\n');
  assert.equal(shouldIgnoreVercelBuild(tipOnly), true);

  const cumulative = changedPathsFromGit({
    cwd: repo,
    env: {
      VERCEL: '1',
      VERCEL_GIT_PREVIOUS_SHA: previousSha,
      VERCEL_GIT_COMMIT_SHA: commitSha,
    },
  });
  assert.deepEqual(cumulative, [
    'scripts/state/pipeline-state.json',
    'src/data/latest-news.json',
  ]);
  assert.equal(shouldIgnoreVercelBuild(cumulative), false);
});

test('Vercel configuration delegates ignored-build decisions to the reviewed script', () => {
  const config = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
  assert.equal(config.ignoreCommand, 'node ./scripts/vercel-ignore-build.mjs');
});
