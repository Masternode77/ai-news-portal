import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { acquireSubscriptionOperationLock, assertSubscriptionOperationLockOwner, releaseSubscriptionOperationLock, subscriptionOperationLockDirectory } from './subscription-operation-lock.mjs';

export const SUBSCRIPTION_JOB_ENV = 'CC_SUBSCRIPTION_JOB_ID';
const UUID = /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i;
const SHA = /^[a-f\d]{40}$/i;
const git = (cwd, ...args) => execFileSync('git', args, {
  cwd, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
}).trim();
const commonDirectory = (cwd) => realpathSync(path.resolve(cwd, git(cwd, 'rev-parse', '--git-common-dir')));
const recordDirectory = (cwd) => path.join(commonDirectory(cwd), 'subscription-jobs');
function recordPath(cwd, id) {
  if (!UUID.test(id || '')) throw new Error('A valid subscription job ID is required.');
  return path.join(recordDirectory(cwd), `${id}.json`);
}
async function save(cwd, record) {
  const filename = recordPath(cwd, record.id);
  await mkdir(path.dirname(filename), { recursive: true, mode: 0o700 });
  const temporary = `${filename}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(record, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
  await rename(temporary, filename);
}

export async function readSubscriptionJob({ cwd = process.cwd(), id }) {
  return JSON.parse(await readFile(recordPath(cwd, id), 'utf8'));
}

const runnerPath = (cwd, id) => `${recordPath(cwd, id)}.runner`;
async function readRunner(cwd, id) {
  return JSON.parse(await readFile(runnerPath(cwd, id), 'utf8').catch((error) => {
    if (error.code === 'ENOENT') return 'null';
    throw error;
  }));
}
function assertRunnerStopped(pid) {
  if (!pid) return;
  try { process.kill(pid, 0); throw new Error('The subscription runner is still running; preserve its lock.'); }
  catch (error) { if (error.code !== 'ESRCH') throw error; }
}

export async function claimSubscriptionJobRunner({ cwd = process.cwd(), id, owner }) {
  await assertSubscriptionOperationLockOwner(owner, { cwd });
  const lease = { token: randomUUID(), owner, pid: process.pid };
  try {
    await writeFile(runnerPath(cwd, id), JSON.stringify(lease), { flag: 'wx', mode: 0o600 });
  } catch (error) {
    if (error.code === 'EEXIST') throw new Error('This subscription job already has a runner; duplicate execution is blocked.');
    throw error;
  }
  try {
    const record = await readSubscriptionJob({ cwd, id });
    if (record.lock_owner !== owner) throw new Error('This owner does not own the selected subscription job.');
    if (record.status !== 'started' || record.finished_at) throw new Error('This attempt has already run; start a new isolated job after finishing it.');
    await updateSubscriptionJob({ cwd, id, owner, patch: { status: 'generating', stage: 'readiness', active_pid: process.pid, last_error: null } });
    return lease;
  } catch (error) {
    await rm(runnerPath(cwd, id));
    throw error;
  }
}

export async function releaseSubscriptionJobRunner({ cwd = process.cwd(), id, owner, lease }) {
  const current = await readRunner(cwd, id);
  if (!current || current.token !== lease.token || current.owner !== owner) throw new Error('Runner lease ownership changed; preserve the job lock.');
  await updateSubscriptionJob({ cwd, id, owner, patch: { active_pid: null } });
  await rm(runnerPath(cwd, id));
}

async function settleJobRelease(cwd, record, releaseLock) {
  const currentOwner = await readFile(path.join(subscriptionOperationLockDirectory({ cwd }), 'owner'), 'utf8').catch((error) => {
    if (error.code === 'ENOENT') return '';
    throw error;
  });
  if (currentOwner.trim() === record.lock_owner) await releaseLock(record.lock_owner, { cwd });
  // A retried finish must never release a newer job's lock. The terminal
  // result was validated before its first save and is immutable on retries.
  if (!record.lock_released_at) {
    record = { ...record, lock_released_at: new Date().toISOString() };
    await save(cwd, record);
  }
  return record;
}

export async function startSubscriptionJob({ cwd = process.cwd(), baseCommit, jobsRoot, fetch = true } = {}) {
  if (!SHA.test(baseCommit || '')) throw new Error('Use the full commit SHA of the verified READY production deployment.');
  const common = commonDirectory(cwd);
  const lockOptions = { cwd, commonDirectory: () => common };
  const lock = await acquireSubscriptionOperationLock(lockOptions);
  let record;
  try {
    const id = randomUUID();
    const repositoryId = createHash('sha256').update(common).digest('hex').slice(0, 16);
    const root = jobsRoot || path.join(homedir(), '.local', 'share', 'compute-current', 'subscription-jobs', repositoryId);
    const workspace = path.resolve(root, id);
    record = { version: 1, id, lock_owner: lock.owner, base_commit: baseCommit, workspace, status: 'starting', stage: 'synchronize_production', started_at: new Date().toISOString(), updated_at: new Date().toISOString(), active_pid: null };
    await save(cwd, record);
    if (fetch) git(cwd, 'fetch', 'origin');
    if (git(cwd, 'rev-parse', 'refs/remotes/origin/main') !== baseCommit) {
      throw new Error('The verified production commit differs from remote main; wait for deployment alignment before generation.');
    }
    record.stage = 'workspace';
    await save(cwd, record);
    await mkdir(root, { recursive: true, mode: 0o700 });
    // Detached, isolated checkout: neither user edits nor a rejected draft from a
    // previous attempt is ever reset, stashed, copied into this job or removed.
    git(cwd, 'worktree', 'add', '--detach', workspace, baseCommit);
    record.status = 'started';
    record.stage = 'readiness';
    await save(cwd, record);
    return { ...record, owner: lock.owner };
  } catch (error) {
    let failureSaved = false;
    try {
      if (record) {
        record = { ...record, status: 'failed', last_error: String(error.message).slice(0, 1000), finished_at: new Date().toISOString() };
        await save(cwd, record);
        failureSaved = true;
      }
    } finally {
      if (failureSaved) await settleJobRelease(cwd, record, releaseSubscriptionOperationLock);
      else await releaseSubscriptionOperationLock(lock.owner, lockOptions);
    }
    throw error;
  }
}

export async function updateSubscriptionJob({ cwd = process.cwd(), id, owner, patch }) {
  await assertSubscriptionOperationLockOwner(owner, { cwd });
  const allowed = new Set(['status', 'stage', 'active_pid', 'last_error']);
  if (Object.keys(patch).some((key) => !allowed.has(key))) throw new Error('Job update contains an unsupported field.');
  if (patch.status && !['generating', 'awaiting_artwork', 'failed'].includes(patch.status)) throw new Error('Unsupported job progress status.');
  if (patch.active_pid != null && (!Number.isSafeInteger(patch.active_pid) || patch.active_pid <= 0)) throw new Error('Invalid active runner PID.');
  const record = await readSubscriptionJob({ cwd, id });
  if (record.lock_owner !== owner) throw new Error('This owner does not own the selected subscription job.');
  if (record.finished_at) throw new Error('This subscription job has already finished.');
  const updated = { ...record, ...patch, updated_at: new Date().toISOString() };
  await save(cwd, updated);
  return updated;
}

export async function finishSubscriptionJob({ cwd = process.cwd(), id, owner, status, reason = '', fetch = true, releaseLock = releaseSubscriptionOperationLock }) {
  if (!['failed', 'published', 'no_change'].includes(status)) throw new Error('Finish status must be failed, published or no_change.');
  const record = await readSubscriptionJob({ cwd, id });
  if (record.lock_owner !== owner) throw new Error('This owner does not own the selected subscription job; its lock is not owned by this caller.');
  if (record.finished_at) {
    if (record.status !== status) throw new Error('A finished subscription job cannot change its result.');
    return settleJobRelease(cwd, record, releaseLock);
  }
  await assertSubscriptionOperationLockOwner(owner, { cwd });
  if (commonDirectory(record.workspace) !== commonDirectory(cwd)) throw new Error('Job workspace belongs to a different repository.');
  const runner = await readRunner(cwd, id);
  assertRunnerStopped(record.active_pid);
  assertRunnerStopped(runner?.pid);
  if (runner && runner.owner !== owner) throw new Error('Runner lease ownership changed; preserve the job lock.');
  let publishedCommit;
  if (status !== 'failed') {
    if (git(record.workspace, 'status', '--porcelain')) throw new Error('A successful job must have a clean committed workspace.');
    if (status === 'published') {
      if (fetch) git(cwd, 'fetch', 'origin');
      publishedCommit = git(record.workspace, 'rev-parse', 'HEAD');
      if (publishedCommit === record.base_commit) throw new Error('No new publication commit exists.');
      try { git(cwd, 'merge-base', '--is-ancestor', publishedCommit, 'refs/remotes/origin/main'); }
      catch { throw new Error('Publication commit has not reached remote main.'); }
    } else if (git(record.workspace, 'rev-parse', 'HEAD') !== record.base_commit) {
      throw new Error('A no_change job cannot contain unpublished commits.');
    }
  }
  const result = { ...record, status, active_pid: null, updated_at: new Date().toISOString(), finished_at: new Date().toISOString(), ...(reason ? { last_error: String(reason).slice(0, 1000) } : {}), ...(publishedCommit ? { published_commit: publishedCommit } : {}) };
  await save(cwd, result);
  if (runner) await rm(runnerPath(cwd, id));
  return settleJobRelease(cwd, result, releaseLock);
}

async function main() {
  const [action, ...args] = process.argv.slice(2);
  const options = {};
  for (let i = 0; i < args.length; i += 2) {
    if (!['--ref', '--id', '--status', '--reason'].includes(args[i]) || !args[i + 1] || options[args[i]]) throw new Error('Invalid subscription job arguments.');
    options[args[i]] = args[i + 1];
  }
  if (action === 'status' && !args.length) {
    const filenames = await readdir(recordDirectory(process.cwd())).catch((error) => { if (error.code === 'ENOENT') return []; throw error; });
    const records = await Promise.all(filenames.filter((name) => name.endsWith('.json')).map((name) => readSubscriptionJob({ id: name.slice(0, -5) })));
    console.log(JSON.stringify(records.sort((a, b) => b.started_at.localeCompare(a.started_at)).slice(0, 10).map(({ lock_owner, ...record }) => record), null, 2));
    return;
  }
  if ((process.env.CI && process.env.CI !== 'false') || process.env.GITHUB_ACTIONS === 'true' || process.env.VERCEL === '1') throw new Error('Subscription jobs are local-only.');
  if (action === 'start' && Object.keys(options).length === 1 && options['--ref']) {
    console.log(JSON.stringify(await startSubscriptionJob({ baseCommit: options['--ref'] }), null, 2));
  } else if (action === 'finish' && options['--id'] && options['--status'] && !options['--ref']) {
    console.log(JSON.stringify(await finishSubscriptionJob({ id: options['--id'], owner: process.env.CC_SUBSCRIPTION_LOCK_OWNER, status: options['--status'], reason: options['--reason'] }), null, 2));
  } else throw new Error('Usage: subscription-job.mjs start --ref <production-sha> | status | finish --id <id> --status <failed|published|no_change> [--reason <reason>]');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(`[subscription-job] ${error.message}`); process.exitCode = 1; });
}
