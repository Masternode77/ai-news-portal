import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import {
  acquireSubscriptionOperationLock,
  assertSubscriptionOperationLockOwner,
  releaseSubscriptionOperationLock,
} from '../scripts/subscription-operation-lock.mjs';

const execute = promisify(execFile);
const SCRIPT = fileURLToPath(new URL('../scripts/subscription-operation-lock.mjs', import.meta.url));

test('one common Git directory serializes checkouts and only its owner can release', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'subscription-operation-lock-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const common = path.join(root, 'common');
  const first = path.join(root, 'first');
  const second = path.join(root, 'second');
  await Promise.all([mkdir(common), mkdir(first), mkdir(second)]);
  const commonDirectory = () => common;

  const lock = await acquireSubscriptionOperationLock({ cwd: first, commonDirectory });
  assert.equal((await readFile(path.join(lock.directory, 'owner'), 'utf8')).trim(), lock.owner);
  await assert.rejects(
    acquireSubscriptionOperationLock({ cwd: second, commonDirectory }),
    /Another subscription writer/,
  );
  await assertSubscriptionOperationLockOwner(lock.owner, { cwd: second, commonDirectory });
  await assert.rejects(
    releaseSubscriptionOperationLock('not-the-owner', { cwd: second, commonDirectory }),
    /not owned by the supplied/,
  );
  assert.deepEqual(await readdir(common), ['subscription-news.lock']);

  await releaseSubscriptionOperationLock(lock.owner, { cwd: second, commonDirectory });
  assert.deepEqual(await readdir(common), []);
});

test('CLI prints an owner token and requires that token from the environment to release', async (t) => {
  const cwd = await mkdtemp(path.join(tmpdir(), 'subscription-operation-lock-cli-'));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  await execute('git', ['init', '--quiet'], { cwd });

  const acquired = await execute(process.execPath, [SCRIPT, 'acquire'], { cwd });
  const owner = acquired.stdout.trim();
  assert.match(owner, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  await assert.rejects(
    execute(process.execPath, [SCRIPT, 'release'], {
      cwd, env: { ...process.env, CC_SUBSCRIPTION_LOCK_OWNER: 'not-the-owner' },
    }),
    /not owned by the supplied/,
  );
  assert.deepEqual(await readdir(path.join(cwd, '.git', 'subscription-news.lock')), ['owner']);

  await execute(process.execPath, [SCRIPT, 'release'], {
    cwd, env: { ...process.env, CC_SUBSCRIPTION_LOCK_OWNER: owner },
  });
  assert.equal((await readdir(path.join(cwd, '.git'))).includes('subscription-news.lock'), false);
});
