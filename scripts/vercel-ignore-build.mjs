import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const STATE_ONLY_PATHS = new Set([
  'public/dashboard-data.json',
  'scripts/state/pipeline-state.json',
]);

export function shouldIgnoreVercelBuild(changedPaths = []) {
  return changedPaths.length > 0
    && changedPaths.every((filePath) => STATE_ONLY_PATHS.has(String(filePath).trim()));
}

const COMMIT_SHA_RE = /^[0-9a-f]{40}$/i;

export function gitComparison(env = process.env) {
  const isVercel = env.VERCEL === '1'
    || Boolean(env.VERCEL_GIT_PREVIOUS_SHA)
    || Boolean(env.VERCEL_GIT_COMMIT_SHA);
  if (!isVercel) return ['HEAD^', 'HEAD'];

  const previousSha = String(env.VERCEL_GIT_PREVIOUS_SHA || '').trim();
  const commitSha = String(env.VERCEL_GIT_COMMIT_SHA || '').trim();
  if (!COMMIT_SHA_RE.test(previousSha) || !COMMIT_SHA_RE.test(commitSha)) return null;
  return [previousSha, commitSha];
}

export function changedPathsFromGit({ env = process.env, cwd = process.cwd() } = {}) {
  const comparison = gitComparison(env);
  if (!comparison) return null;

  try {
    return execFileSync('git', ['diff', '--name-only', ...comparison], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
      .split('\n')
      .map((filePath) => filePath.trim())
      .filter(Boolean);
  } catch {
    return null;
  }
}

function main() {
  const changedPaths = changedPathsFromGit();
  if (!changedPaths) {
    console.log('[vercel-ignore-build] Git comparison unavailable; continuing build.');
    process.exitCode = 1;
    return;
  }

  if (shouldIgnoreVercelBuild(changedPaths)) {
    console.log(`[vercel-ignore-build] Ignoring state-only commit: ${changedPaths.join(', ')}`);
    process.exitCode = 0;
    return;
  }

  console.log('[vercel-ignore-build] Product or content files changed; continuing build.');
  process.exitCode = 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
