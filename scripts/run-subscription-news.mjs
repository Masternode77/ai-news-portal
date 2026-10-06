import { spawn, execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  acquireSubscriptionOperationLock,
  assertSubscriptionOperationLockOwner,
  releaseSubscriptionOperationLock,
  SUBSCRIPTION_LOCK_OWNER_ENV,
} from './subscription-operation-lock.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEADLINE_MS = 90 * 60 * 1000;
export const SUBSCRIPTION_NEWS_STEPS = [
  ['npm', ['run', 'check']],
  ['node', ['scripts/pipeline.mjs']],
  ['node', ['scripts/update-industry-headlines.mjs']],
  ['node', ['scripts/restore-eia-public-inventory.mjs']],
  ['npm', ['run', 'rebuild:taxonomy-pages']],
  ['node', ['scripts/audit-omo-ultra-current-state.mjs']],
  ['npm', ['test']],
  ['npm', ['run', 'content:gate']],
  ['node', ['scripts/audit-omo-ultra-current-state.mjs']],
  ['node', ['--test', 'tests/omo-ultra-audit.test.mjs']],
];

export function subscriptionNewsEnvironment(source) {
  const env = { ...source };
  for (const key of Object.keys(env)) {
    if (/API_KEY|AUTH_TOKEN|ACCESS_TOKEN|SERVICE_ROLE|SUPABASE|ANTHROPIC_BASE_URL|OPENAI_BASE_URL/.test(key)) {
      delete env[key];
    }
  }
  return {
    ...env,
    OPENROUTER_API_KEY: '', OPENAI_API_KEY: '', ANTHROPIC_API_KEY: '',
    SUPABASE_URL: '', SUPABASE_SERVICE_ROLE_KEY: '',
    LLM_PROVIDER: 'subscription', IMAGE_PROVIDER: 'codex',
    PIPELINE_OFFLINE: '0',
  };
}

export function runSubscriptionCommand(command, args, { cwd, env, signal }) {
  return new Promise((resolve, reject) => {
    signal.throwIfAborted();
    const executable = command === 'node' ? process.execPath : command;
    const child = spawn(executable, args, { cwd, env, stdio: 'inherit', detached: process.platform !== 'win32' });
    let forceStop;
    const kill = (value) => {
      try {
        if (process.platform !== 'win32') process.kill(-child.pid, value);
        else child.kill(value);
      } catch (error) {
        if (error.code !== 'ESRCH') reject(error);
      }
    };
    const abort = () => {
      kill('SIGTERM');
      forceStop = setTimeout(() => kill('SIGKILL'), 5000);
    };
    signal.addEventListener('abort', abort, { once: true });
    child.once('error', reject);
    child.once('close', (code) => {
      clearTimeout(forceStop);
      signal.removeEventListener('abort', abort);
      if (signal.aborted) {
        // npm may exit before its children; terminate the remaining process group before releasing the writer lock.
        if (process.platform !== 'win32') kill('SIGKILL');
        reject(signal.reason);
      }
      else if (code !== 0) reject(new Error(`${command} ${args.join(' ')} failed (exit ${code}). Local partial output is preserved; nothing was committed or published.`));
      else resolve();
    });
    if (signal.aborted) abort();
  });
}

export async function runSubscriptionNews({
  args = process.argv.slice(2), cwd = ROOT, env = process.env,
  output = console.log, runCommand = runSubscriptionCommand,
  readiness = async (options) => (await import('./lib/subscription-provider.mjs')).assertSubscriptionReady(options),
  commonDirectory = () => execFileSync('git', ['rev-parse', '--git-common-dir'], { cwd, encoding: 'utf8' }).trim(),
  signal, deadlineMs = DEADLINE_MS,
} = {}) {
  if (args.length > 1 || args.some((arg) => !['--help', '--check', '--dry-run'].includes(arg))) {
    throw new Error('Usage: node scripts/run-subscription-news.mjs [--help|--check|--dry-run]');
  }
  if (args[0] === '--help') {
    output('Usage: node scripts/run-subscription-news.mjs [--help|--check|--dry-run]\n'
      + '--check: verify Codex and Claude subscription login without generation.\n'
      + '--dry-run: describe steps without authentication calls or filesystem writes.\n'
      + 'Default: generate and validate local content under a shared Git lock (90-minute deadline).\n'
      + 'Set SUBSCRIPTION_INCLUDED_USAGE_CONFIRMED=1 only after confirming extra paid usage is disabled in both accounts.\n'
      + 'Requires installed dependencies, Codex/Claude subscription logins and local generation authorization.\n'
      + `An automation may hold the operation lock across later artwork/review steps by exporting ${SUBSCRIPTION_LOCK_OWNER_ENV} from subscription-operation-lock.mjs acquire.\n`
      + 'Never commits, pushes, deploys, or marks publication successful. Local partial output is preserved on failure.\n'
      + 'The Mac Codex task must generate/import unique native artwork and rerun publication gates before publishing.');
    return;
  }
  if (args[0] === '--dry-run') {
    output('Readiness -> shared Git operation lock -> local steps (LLM_PROVIDER=subscription, IMAGE_PROVIDER=codex; API keys and remote archive writes disabled):');
    for (const [command, commandArgs] of SUBSCRIPTION_NEWS_STEPS) output(`${command} ${commandArgs.join(' ')}`);
    output('Stop for native Codex image generation/import and final publication review. No commit, push, deployment or success heartbeat.');
    return;
  }
  if ((env.CI && env.CI !== 'false') || env.GITHUB_ACTIONS === 'true' || env.VERCEL === '1' || env.NODE_ENV === 'production') {
    throw new Error('Subscription generation is local-only; CI and production execution are disabled.');
  }
  const safeEnv = subscriptionNewsEnvironment(env);
  const controller = new AbortController();
  const interrupt = () => controller.abort(new Error('Subscription run interrupted; partial local output is preserved.'));
  const externalAbort = () => controller.abort(signal.reason);
  if (signal?.aborted) externalAbort();
  signal?.addEventListener('abort', externalAbort, { once: true });
  process.once('SIGINT', interrupt);
  process.once('SIGTERM', interrupt);
  const timeout = setTimeout(() => controller.abort(new Error('Subscription run exceeded its total deadline.')), deadlineMs);
  let ownedLock;
  try {
    controller.signal.throwIfAborted();
    const lockOptions = { cwd, commonDirectory };
    const outerOwner = env[SUBSCRIPTION_LOCK_OWNER_ENV];
    if (outerOwner) await assertSubscriptionOperationLockOwner(outerOwner, lockOptions);
    else if (args[0] !== '--check') ownedLock = await acquireSubscriptionOperationLock(lockOptions);
    await readiness({ env: safeEnv, signal: controller.signal });
    controller.signal.throwIfAborted();
    if (args[0] === '--check') {
      output('Subscription CLI readiness checks passed. No generation or publication performed.');
      return;
    }
    for (const [command, commandArgs] of SUBSCRIPTION_NEWS_STEPS) {
      controller.signal.throwIfAborted();
      output(`[subscription-news] ${command} ${commandArgs.join(' ')}`);
      await runCommand(command, commandArgs, { cwd, env: safeEnv, signal: controller.signal });
    }
    output('Local generation and validation complete. Native column artwork and publication review remain; nothing was committed or published.');
  } finally {
    clearTimeout(timeout);
    process.removeListener('SIGINT', interrupt);
    process.removeListener('SIGTERM', interrupt);
    signal?.removeEventListener('abort', externalAbort);
    if (ownedLock) await releaseSubscriptionOperationLock(ownedLock.owner, { cwd, commonDirectory });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runSubscriptionNews().catch((error) => {
    console.error(`[subscription-news] ${error.message}`);
    process.exitCode = 1;
  });
}
