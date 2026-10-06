import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, rmdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SUBSCRIPTION_LOCK_OWNER_ENV = 'CC_SUBSCRIPTION_LOCK_OWNER';
const LOCK_NAME = 'subscription-news.lock';

export function subscriptionOperationLockDirectory({
  cwd = process.cwd(),
  commonDirectory = () => execFileSync('git', ['rev-parse', '--git-common-dir'], { cwd, encoding: 'utf8' }).trim(),
} = {}) {
  return path.resolve(cwd, commonDirectory(), LOCK_NAME);
}

export async function acquireSubscriptionOperationLock(options = {}) {
  const directory = subscriptionOperationLockDirectory(options);
  try {
    await mkdir(directory);
  } catch (error) {
    if (error.code === 'EEXIST') {
      throw new Error(`Another subscription writer owns ${directory}. If interrupted, verify its processes have stopped before removing the lock.`);
    }
    throw error;
  }

  const owner = randomUUID();
  try {
    await writeFile(path.join(directory, 'owner'), `${owner}\n`, { flag: 'wx', mode: 0o600 });
  } catch (error) {
    await rmdir(directory).catch(() => {});
    throw error;
  }
  return { directory, owner };
}

export async function assertSubscriptionOperationLockOwner(owner, options = {}) {
  if (!owner) throw new Error(`${SUBSCRIPTION_LOCK_OWNER_ENV} is required to prove subscription lock ownership.`);
  const directory = subscriptionOperationLockDirectory(options);
  const recordedOwner = await readFile(path.join(directory, 'owner'), 'utf8').catch(() => '');
  if (recordedOwner.trim() !== owner) {
    throw new Error(`Subscription lock ${directory} is not owned by the supplied ${SUBSCRIPTION_LOCK_OWNER_ENV}.`);
  }
  return { directory, owner };
}

export async function releaseSubscriptionOperationLock(owner, options = {}) {
  const { directory } = await assertSubscriptionOperationLockOwner(owner, options);
  const releaseDirectory = `${directory}.release-${owner}`;
  await rename(directory, releaseDirectory);
  await rm(releaseDirectory, { recursive: true, force: true });
}

async function main() {
  const [action, extra] = process.argv.slice(2);
  if (extra || !['acquire', 'release'].includes(action)) {
    throw new Error('Usage: node scripts/subscription-operation-lock.mjs <acquire|release>');
  }
  if (action === 'acquire') {
    const { owner } = await acquireSubscriptionOperationLock();
    process.stdout.write(`${owner}\n`);
    return;
  }
  await releaseSubscriptionOperationLock(process.env[SUBSCRIPTION_LOCK_OWNER_ENV]);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`[subscription-lock] ${error.message}`);
    process.exitCode = 1;
  });
}
