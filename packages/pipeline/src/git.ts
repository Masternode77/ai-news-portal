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
