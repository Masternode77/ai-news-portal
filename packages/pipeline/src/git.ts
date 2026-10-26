import { execFileSync } from "node:child_process";

/** GITHUB_SHA in Actions, `git rev-parse HEAD` locally, null when neither is available. Never throws. */
export function resolveGitSha(env: NodeJS.ProcessEnv = process.env, cwd: string = process.cwd()): string | null {
  const fromEnv = env["GITHUB_SHA"];
  if (fromEnv && /^[0-9a-f]{7,40}$/i.test(fromEnv)) return fromEnv;
  try {
    const out = execFileSync("git", ["rev-parse", "HEAD"], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    return /^[0-9a-f]{40}$/i.test(out) ? out : null;
  } catch {
    return null;
  }
}

/** The Actions run page (`GITHUB_SERVER_URL/GITHUB_REPOSITORY/actions/runs/GITHUB_RUN_ID`) when the process is one; null elsewhere. */
export function resolveRunUrl(env: NodeJS.ProcessEnv = process.env): string | null {
  const server = env["GITHUB_SERVER_URL"];
  const repo = env["GITHUB_REPOSITORY"];
  const runId = env["GITHUB_RUN_ID"];
  if (!server || !repo || !runId) return null;
  if (!/^https?:\/\/[^\s/]+$/.test(server) || !/^[\w.-]+\/[\w.-]+$/.test(repo) || !/^\d+$/.test(runId)) return null;
  return `${server}/${repo}/actions/runs/${runId}`;
}
