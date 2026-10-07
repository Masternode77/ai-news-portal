import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, mkdir, readFile, readdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { startSubscriptionJob, finishSubscriptionJob, updateSubscriptionJob, readSubscriptionJob } from '../scripts/subscription-job.mjs';
import { runSubscriptionNews } from '../scripts/run-subscription-news.mjs';
import { releaseSubscriptionOperationLock } from '../scripts/subscription-operation-lock.mjs';

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'subscription-job-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const cwd = path.join(root, 'repo');
  await mkdir(cwd);
  git(cwd, 'init', '-b', 'main');
  git(cwd, 'config', 'user.email', 'fixture@example.invalid');
  git(cwd, 'config', 'user.name', 'Fixture');
  await writeFile(path.join(cwd, 'content.txt'), 'committed\n');
  git(cwd, 'add', '.');
  git(cwd, 'commit', '-m', 'baseline');
  const baseCommit = git(cwd, 'rev-parse', 'HEAD');
  git(cwd, 'update-ref', 'refs/remotes/origin/main', baseCommit);
  return { cwd, baseCommit, jobsRoot: path.join(root, 'jobs'), fetch: false };
}

test('failed generation preserves dirty primary and failed workspace, then next job starts clean', async (t) => {
  const options = await fixture(t);
  await writeFile(path.join(options.cwd, 'content.txt'), 'user edits\n');
  await writeFile(path.join(options.cwd, 'user-note.txt'), 'preserve\n');
  const first = await startSubscriptionJob(options);
  assert.equal(await readFile(path.join(first.workspace, 'content.txt'), 'utf8'), 'committed\n');
  await writeFile(path.join(first.workspace, 'content.txt'), 'rejected draft\n');
  await finishSubscriptionJob({ ...options, id: first.id, owner: first.owner, status: 'failed', reason: 'source review rejected' });
  const second = await startSubscriptionJob(options);
  assert.notEqual(second.workspace, first.workspace);
  assert.equal(await readFile(path.join(second.workspace, 'content.txt'), 'utf8'), 'committed\n');
  assert.equal(await readFile(path.join(first.workspace, 'content.txt'), 'utf8'), 'rejected draft\n');
  assert.equal(await readFile(path.join(options.cwd, 'content.txt'), 'utf8'), 'user edits\n');
  assert.equal(await readFile(path.join(options.cwd, 'user-note.txt'), 'utf8'), 'preserve\n');
  assert.equal((await readSubscriptionJob({ ...options, id: first.id })).status, 'failed');
  await finishSubscriptionJob({ ...options, id: second.id, owner: second.owner, status: 'no_change' });
});

test('concurrent jobs and nonowner completion cannot bypass shared lock', async (t) => {
  const options = await fixture(t);
  const job = await startSubscriptionJob(options);
  await assert.rejects(startSubscriptionJob(options), /Another subscription writer/);
  await assert.rejects(finishSubscriptionJob({ ...options, id: job.id, owner: 'wrong', status: 'failed' }), /not owned/);
  assert.equal((await readSubscriptionJob({ ...options, id: job.id })).status, 'started');
  await finishSubscriptionJob({ ...options, id: job.id, owner: job.owner, status: 'failed' });
});

test('production reference must be exact current remote main; invalid start releases only its own lock', async (t) => {
  const options = await fixture(t);
  await assert.rejects(startSubscriptionJob({ ...options, baseCommit: 'main' }), /full commit/);
  await writeFile(path.join(options.cwd, 'next.txt'), 'next\n');
  git(options.cwd, 'add', 'next.txt'); git(options.cwd, 'commit', '-m', 'next');
  git(options.cwd, 'update-ref', 'refs/remotes/origin/main', git(options.cwd, 'rev-parse', 'HEAD'));
  await assert.rejects(startSubscriptionJob(options), /production.*remote main/i);
  const records = await readdir(path.join(options.cwd, '.git/subscription-jobs'));
  const failed = JSON.parse(await readFile(path.join(options.cwd, '.git/subscription-jobs', records[0]), 'utf8'));
  assert.equal(failed.status, 'failed');
  assert.equal(failed.stage, 'synchronize_production');
  assert.ok(failed.lock_released_at);
  const job = await startSubscriptionJob({ ...options, baseCommit: git(options.cwd, 'rev-parse', 'HEAD') });
  await finishSubscriptionJob({ ...options, id: job.id, owner: job.owner, status: 'no_change' });
});

test('active runner prevents lock release; progress survives failures and cannot alter identity', async (t) => {
  const options = await fixture(t);
  const job = await startSubscriptionJob(options);
  await updateSubscriptionJob({ ...options, id: job.id, owner: job.owner, patch: { status: 'generating', stage: 'source-review', active_pid: process.pid } });
  await assert.rejects(finishSubscriptionJob({ ...options, id: job.id, owner: job.owner, status: 'failed' }), /still running/);
  await assert.rejects(updateSubscriptionJob({ ...options, id: job.id, owner: job.owner, patch: { workspace: '/elsewhere' } }), /unsupported/);
  await updateSubscriptionJob({ ...options, id: job.id, owner: job.owner, patch: { active_pid: null, last_error: 'source review rejected' } });
  await finishSubscriptionJob({ ...options, id: job.id, owner: job.owner, status: 'failed' });
  const record = await readSubscriptionJob({ ...options, id: job.id });
  assert.equal(record.stage, 'source-review');
  assert.equal(record.last_error, 'source review rejected');
  assert.ok(record.finished_at);
});

test('published status requires a clean committed result that exists on remote main', async (t) => {
  const options = await fixture(t);
  const job = await startSubscriptionJob(options);
  await writeFile(path.join(job.workspace, 'content.txt'), 'validated output\n');
  await assert.rejects(finishSubscriptionJob({ ...options, id: job.id, owner: job.owner, status: 'published' }), /clean/);
  git(job.workspace, 'add', 'content.txt'); git(job.workspace, 'commit', '-m', 'validated output');
  await assert.rejects(finishSubscriptionJob({ ...options, id: job.id, owner: job.owner, status: 'published' }), /remote main/);
  git(options.cwd, 'update-ref', 'refs/remotes/origin/main', git(job.workspace, 'rev-parse', 'HEAD'));
  await finishSubscriptionJob({ ...options, id: job.id, owner: job.owner, status: 'published' });
  assert.equal((await readSubscriptionJob({ ...options, id: job.id })).published_commit, git(job.workspace, 'rev-parse', 'HEAD'));
});

test('a new lock owner cannot finish an abandoned job belonging to another owner', async (t) => {
  const options = await fixture(t);
  const first = await startSubscriptionJob(options);
  await releaseSubscriptionOperationLock(first.owner, { cwd: options.cwd });
  const second = await startSubscriptionJob(options);
  await assert.rejects(finishSubscriptionJob({ ...options, id: first.id, owner: second.owner, status: 'failed' }), /does not own/);
  await finishSubscriptionJob({ ...options, id: second.id, owner: second.owner, status: 'no_change' });
});

test('actual runner records failed stage and clears PID while keeping outer artwork lock', async (t) => {
  const options = await fixture(t);
  const job = await startSubscriptionJob(options);
  const env = { CC_SUBSCRIPTION_JOB_ID: job.id, CC_SUBSCRIPTION_LOCK_OWNER: job.owner };
  await assert.rejects(runSubscriptionNews({
    cwd: job.workspace, args: [], env, output: () => {}, readiness: async () => {},
    runCommand: async (command, args) => {
      if (args.includes('scripts/pipeline.mjs')) {
        await writeFile(path.join(job.workspace, 'rejected.json'), '{"rejected":true}');
        throw new Error('source fidelity rejected');
      }
    },
  }), /source fidelity rejected/);
  const record = await readSubscriptionJob({ ...options, id: job.id });
  assert.equal(record.status, 'failed');
  assert.equal(record.stage, 'node scripts/pipeline.mjs');
  assert.equal(record.active_pid, null);
  assert.equal(record.last_error, 'source fidelity rejected');
  await assert.rejects(startSubscriptionJob(options), /Another subscription writer/);
  await finishSubscriptionJob({ ...options, id: job.id, owner: job.owner, status: 'failed' });
  assert.equal(await readFile(path.join(job.workspace, 'rejected.json'), 'utf8'), '{"rejected":true}');
});

test('job cannot run in primary checkout and successful text alone is awaiting artwork, never published', async (t) => {
  const options = await fixture(t);
  const job = await startSubscriptionJob(options);
  const runOptions = { args: [], env: { CC_SUBSCRIPTION_JOB_ID: job.id, CC_SUBSCRIPTION_LOCK_OWNER: job.owner }, output: () => {}, readiness: async () => {}, runCommand: async () => {} };
  await assert.rejects(runSubscriptionNews({ ...runOptions, cwd: options.cwd }), /own isolated workspace/);
  await runSubscriptionNews({ ...runOptions, cwd: job.workspace });
  const record = await readSubscriptionJob({ ...options, id: job.id });
  assert.equal(record.status, 'awaiting_artwork');
  assert.equal(record.active_pid, null);
  assert.equal(record.finished_at, undefined);
  await finishSubscriptionJob({ ...options, id: job.id, owner: job.owner, status: 'no_change' });
});

test('finish retries a failed release and never releases a subsequent job lock', async (t) => {
  const options = await fixture(t);
  const job = await startSubscriptionJob(options);
  const finish = { ...options, id: job.id, owner: job.owner, status: 'failed' };
  await assert.rejects(finishSubscriptionJob({ ...finish, releaseLock: async () => { throw Object.assign(new Error('release denied'), { code: 'EACCES' }); } }), /release denied/);
  assert.ok((await readSubscriptionJob({ ...options, id: job.id })).finished_at);
  await assert.rejects(startSubscriptionJob(options), /Another subscription writer/);
  const result = await finishSubscriptionJob(finish);
  assert.ok(result.lock_released_at);
  const next = await startSubscriptionJob(options);
  assert.deepEqual(await finishSubscriptionJob(finish), result);
  await assert.rejects(startSubscriptionJob(options), /Another subscription writer/);
  await assert.rejects(finishSubscriptionJob({ ...finish, status: 'no_change' }), /cannot change/);
  await finishSubscriptionJob({ ...options, id: next.id, owner: next.owner, status: 'no_change' });
});

test('two independent processes with the same job owner cannot both reach readiness', async (t) => {
  const options = await fixture(t);
  const job = await startSubscriptionJob(options);
  const moduleUrl = new URL('../scripts/run-subscription-news.mjs', import.meta.url).href;
  const code = `import {runSubscriptionNews} from ${JSON.stringify(moduleUrl)};
    await runSubscriptionNews({cwd:process.env.JOB_WORKSPACE,args:[],output:()=>{},
      readiness:async()=>{process.stdout.write('READY\\n'); await new Promise(resolve=>process.stdin.once('data',resolve));},
      runCommand:async()=>{}});`;
  const env = { ...process.env, CI: '', GITHUB_ACTIONS: '', VERCEL: '', NODE_ENV: 'test', JOB_WORKSPACE: job.workspace, CC_SUBSCRIPTION_JOB_ID: job.id, CC_SUBSCRIPTION_LOCK_OWNER: job.owner };
  const first = spawn(process.execPath, ['--input-type=module', '-e', code], { env, stdio: ['pipe', 'pipe', 'pipe'] });
  t.after(() => first.kill());
  const exited = once(first, 'exit');
  const [ready] = await once(first.stdout, 'data');
  assert.match(ready.toString(), /READY/);
  assert.throws(() => execFileSync(process.execPath, ['--input-type=module', '-e', code], { env, timeout: 10_000, stdio: ['ignore', 'pipe', 'pipe'] }), (error) => {
    assert.match(error.stderr.toString(), /duplicate execution is blocked/);
    assert.doesNotMatch(error.stdout.toString(), /READY/);
    return true;
  });
  first.stdin.end('continue');
  const [exitCode] = await exited;
  assert.equal(exitCode, 0);
  assert.equal((await readSubscriptionJob({ ...options, id: job.id })).status, 'awaiting_artwork');
  await finishSubscriptionJob({ ...options, id: job.id, owner: job.owner, status: 'no_change' });
});

test('a failed attempt cannot be rerun under its old owner', async (t) => {
  const options = await fixture(t);
  const job = await startSubscriptionJob(options);
  const run = { cwd: job.workspace, args: [], env: { CC_SUBSCRIPTION_JOB_ID: job.id, CC_SUBSCRIPTION_LOCK_OWNER: job.owner }, output: () => {}, readiness: async () => { throw new Error('auth unavailable'); } };
  await assert.rejects(runSubscriptionNews(run), /auth unavailable/);
  let called = false;
  await assert.rejects(runSubscriptionNews({ ...run, readiness: async () => { called = true; } }), /already run/);
  assert.equal(called, false);
  await finishSubscriptionJob({ ...options, id: job.id, owner: job.owner, status: 'failed' });
});
