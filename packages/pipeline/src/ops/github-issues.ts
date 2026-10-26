/**
 * The GitHub Issues REST calls the ops alarm needs (Phase 4, 3i notes §5.3):
 * list, create, update, comment. The token is read by name (GITHUB_TOKEN)
 * by the caller and only ever placed in the Authorization header; errors
 * carry the HTTP status and the response text, never the request headers.
 * `fetch` is injected so the tests and the dry run never reach GitHub.
 */
import type { OpsIssuePlan, OpsIssueRef } from "./issue.ts";

export interface GitHubIssuesClientOptions {
  /** `owner/name` (GITHUB_REPOSITORY in Actions). */
  repo: string;
  token: string;
  fetch: typeof globalThis.fetch;
  apiBase?: string;
  userAgent?: string;
}

export class GitHubIssuesError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "GitHubIssuesError";
    this.status = status;
  }
}

export interface GitHubIssuesClient {
  list(): Promise<OpsIssueRef[]>;
  create(title: string, body: string): Promise<{ number: number; html_url: string }>;
  update(number: number, patch: { title?: string; body?: string; state?: "open" | "closed"; state_reason?: "completed" | "reopened" }): Promise<{ number: number; html_url: string }>;
  comment(number: number, body: string): Promise<{ id: number }>;
}

const REPO_RE = /^[\w.-]+\/[\w.-]+$/;

export function createGitHubIssuesClient(options: GitHubIssuesClientOptions): GitHubIssuesClient {
  if (!REPO_RE.test(options.repo)) throw new GitHubIssuesError(`repository must be owner/name, got "${options.repo}"`, 0);
  const base = `${(options.apiBase ?? "https://api.github.com").replace(/\/+$/, "")}/repos/${options.repo}`;

  async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const response = await options.fetch(`${base}${path}`, {
      method,
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${options.token}`,
        "content-type": "application/json",
        "user-agent": options.userAgent ?? "cc-pipeline-ops-alarm",
        "x-github-api-version": "2022-11-28",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    if (!response.ok) throw new GitHubIssuesError(`GitHub ${method} ${path} → HTTP ${response.status}: ${text.slice(0, 300)}`, response.status);
    return (text.length > 0 ? JSON.parse(text) : {}) as T;
  }

  return {
    async list() {
      // The most recently updated 100 issues: the alarm issue is touched on every transition, so it is among them.
      const rows = await request<Array<{ number: number; state: string; title: string; body: string | null; pull_request?: unknown }>>("GET", "/issues?state=all&per_page=100&sort=updated&direction=desc");
      return rows.map((row) => ({ number: row.number, state: row.state === "open" ? "open" : "closed", title: row.title, body: row.body ?? null, pull_request: row.pull_request }));
    },
    create(title, body) {
      return request("POST", "/issues", { title, body });
    },
    update(number, patch) {
      return request("PATCH", `/issues/${number}`, patch);
    },
    comment(number, body) {
      return request("POST", `/issues/${number}/comments`, { body });
    },
  };
}

export interface OpsIssueResult {
  action: OpsIssuePlan["action"];
  state: OpsIssuePlan["state"];
  number: number | null;
  url: string | null;
  reason?: string;
}

/** Applies a plan: a comment first (the transition record), then the issue itself, so a half-applied plan still leaves the trail. */
export async function applyOpsIssuePlan(plan: OpsIssuePlan, client: GitHubIssuesClient): Promise<OpsIssueResult> {
  switch (plan.action) {
    case "none":
      return { action: "none", state: plan.state, number: null, url: null, reason: plan.reason };
    case "create": {
      const created = await client.create(plan.title, plan.body);
      return { action: "create", state: plan.state, number: created.number, url: created.html_url };
    }
    case "update": {
      await client.comment(plan.number, plan.comment);
      const updated = await client.update(plan.number, plan.reopen ? { title: plan.title, body: plan.body, state: "open", state_reason: "reopened" } : { title: plan.title, body: plan.body });
      return { action: "update", state: plan.state, number: updated.number, url: updated.html_url };
    }
    case "close": {
      await client.comment(plan.number, plan.comment);
      const closed = await client.update(plan.number, { state: "closed", state_reason: "completed" });
      return { action: "close", state: plan.state, number: closed.number, url: closed.html_url };
    }
  }
}
