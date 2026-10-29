import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { OpsReport } from "../src/ops/check.ts";
import { alarmState, findOpsIssue, OPS_ISSUE_MARKER, planOpsIssue, readIssueState, renderOpsIssue } from "../src/ops/issue.ts";
import type { OpsIssueRef } from "../src/ops/issue.ts";
import { applyOpsIssuePlan, createGitHubIssuesClient, GitHubIssuesError } from "../src/ops/github-issues.ts";
import { parseSyncArgs, readOpsReport, syncOpsIssue, SyncUsageError } from "../tools/ops-issue-sync.ts";

const NOW = new Date("2026-10-27T01:00:00Z");
const CTX = { exitCode: 1, runUrl: "https://github.com/o/r/actions/runs/1", now: NOW };

function report(status: OpsReport["status"], reasons: string[] = []): OpsReport {
  return {
    status,
    checked_at: NOW.toISOString(),
    stale_after_hours: 12,
    last_success: { run_id: "11111111-0000-4000-8000-000000000001", status: "done", started_at: "2026-10-26T15:45:00Z", ended_at: "2026-10-26T15:50:00Z", published: 1, cost_usd: 0.4, error: null },
    hours_since_success: status === "stale" ? 20 : 1,
    last_run: null,
    consecutive_failures: status === "failing" ? 2 : 0,
    crashed: 0,
    running: 0,
    window_24h: { runs: 3, done: 3, partial: 0, budget_stop: 0, failed: 0, published: 3, cost_usd: 1.2 },
    cost_7d_usd: 4.8,
    reasons,
  };
}

function issue(over: Partial<OpsIssueRef> & { number: number }): OpsIssueRef {
  const { body, ...rest } = over;
  return { state: "open", title: "[CC pipeline] ops alarm: STALE", body: body === undefined ? `${OPS_ISSUE_MARKER}\n<!-- cc-ops-alarm:state=stale -->\nx` : body, ...rest };
}

test("alarm state: the report status, or unknown when ops produced no verdict (exit 2 or no report)", () => {
  assert.equal(alarmState(report("ok"), 0), "ok");
  assert.equal(alarmState(report("failing"), 1), "failing");
  assert.equal(alarmState(null, 1), "unknown");
  assert.equal(alarmState(report("ok"), 2), "unknown");
});

test("the alarm issue is found by the body marker: the open one wins, else the newest closed one; PRs and other issues are ignored", () => {
  const other = issue({ number: 29, body: "legacy <!-- operations-monitor:heartbeat --> issue" });
  const pr = issue({ number: 75, pull_request: {} });
  const closedOld = issue({ number: 80, state: "closed" });
  const closedNew = issue({ number: 90, state: "closed" });
  const open = issue({ number: 85 });
  assert.equal(findOpsIssue([other, pr]), null);
  assert.equal(findOpsIssue([other, closedOld, closedNew, pr])?.number, 90);
  assert.equal(findOpsIssue([closedNew, open, closedOld])?.number, 85);
  assert.equal(readIssueState(open.body), "stale");
  assert.equal(readIssueState("no marker"), null);
  assert.equal(readIssueState(`${OPS_ISSUE_MARKER}\n<!-- cc-ops-alarm:state=bogus -->`), null);
});

test("transitions: healthy writes nothing without an open issue and closes an open one with a recovered comment", () => {
  assert.deepEqual(planOpsIssue(report("ok"), null, { ...CTX, exitCode: 0 }), { action: "none", state: "ok", reason: "healthy; no alarm issue" });
  assert.equal(planOpsIssue(report("ok"), issue({ number: 7, state: "closed" }), { ...CTX, exitCode: 0 }).action, "none");
  const close = planOpsIssue(report("ok"), issue({ number: 7 }), { ...CTX, exitCode: 0 });
  assert.equal(close.action, "close");
  if (close.action === "close") {
    assert.equal(close.number, 7);
    assert.match(close.comment, /^Recovered at 2026-10-27T01:00:00\.000Z/);
    assert.match(close.comment, /\[CC ops\] .* · OK/);
    assert.match(close.comment, /Workflow run: https:\/\/github\.com\/o\/r\/actions\/runs\/1/);
  }
});

test("transitions: an alert creates the issue, the same open state is a no-op, a different state updates, a closed issue is reopened", () => {
  const create = planOpsIssue(report("stale", ["last completed run 20 h ago"]), null, CTX);
  assert.equal(create.action, "create");
  if (create.action === "create") {
    assert.equal(create.title, "[CC pipeline] ops alarm: STALE");
    assert.ok(create.body.startsWith(`${OPS_ISSUE_MARKER}\n<!-- cc-ops-alarm:state=stale -->`));
    assert.match(create.body, /last completed run 20 h ago/);
    assert.match(create.body, /Workflow run: https:\/\/github\.com\/o\/r\/actions\/runs\/1/);
  }
  assert.equal(planOpsIssue(report("stale"), issue({ number: 7 }), CTX).action, "none");
  const update = planOpsIssue(report("failing", ["2 consecutive failed/budget_stop runs"]), issue({ number: 7 }), CTX);
  assert.equal(update.action, "update");
  if (update.action === "update") {
    assert.equal(update.reopen, false);
    assert.equal(update.title, "[CC pipeline] ops alarm: FAILING");
    assert.match(update.comment, /^State change at .*: stale → \*\*failing\*\*/);
    assert.match(update.body, /cc-ops-alarm:state=failing/);
  }
  const reopen = planOpsIssue(report("stale"), issue({ number: 7, state: "closed" }), CTX);
  assert.equal(reopen.action, "update");
  if (reopen.action === "update") {
    assert.equal(reopen.reopen, true);
    assert.match(reopen.comment, /^Relapse at .*: stale → \*\*stale\*\*/);
  }
});

test("no verdict (exit 2) is the alert state unknown, never healthy; its body says why", () => {
  const plan = planOpsIssue(null, null, { ...CTX, exitCode: 2 });
  assert.equal(plan.action, "create");
  assert.equal(plan.state, "unknown");
  const { title, body } = renderOpsIssue(null, "unknown", { ...CTX, exitCode: 2 });
  assert.equal(title, "[CC pipeline] ops alarm: UNKNOWN");
  assert.match(body, /no ops verdict: pipeline ops exited 2/);
  assert.equal(planOpsIssue(null, issue({ number: 7, body: `${OPS_ISSUE_MARKER}\n<!-- cc-ops-alarm:state=unknown -->` }), { ...CTX, exitCode: 2 }).action, "none");
});

interface Call { method: string; url: string; body: unknown; auth: string | null }

function fakeGitHub(issues: unknown[], failWith?: number, morePages: unknown[][] = []) {
  const calls: Call[] = [];
  const pages = [issues, ...morePages];
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const url = String(input);
    const headers = new Headers(init?.headers);
    calls.push({ method: init?.method ?? "GET", url, body: init?.body ? JSON.parse(String(init.body)) : null, auth: headers.get("authorization") });
    if (failWith) return new Response(JSON.stringify({ message: "nope" }), { status: failWith });
    const listMatch = /\/issues\?state=all&per_page=100&sort=updated&direction=desc&page=(\d+)$/.exec(url);
    if (listMatch) return new Response(JSON.stringify(pages[Number(listMatch[1]) - 1] ?? []), { status: 200 });
    if (/\/issues$/.test(url)) return new Response(JSON.stringify({ number: 101, html_url: "https://github.com/o/r/issues/101" }), { status: 201 });
    if (/\/issues\/\d+\/comments$/.test(url)) return new Response(JSON.stringify({ id: 5 }), { status: 201 });
    if (/\/issues\/\d+$/.test(url)) return new Response(JSON.stringify({ number: Number(url.split("/").pop()), html_url: `https://github.com/o/r/issues/${url.split("/").pop()}` }), { status: 200 });
    return new Response("not found", { status: 404 });
  };
  return { calls, fetch };
}

test("GitHub client: bearer token only in the header, create / comment-then-update / comment-then-close, HTTP errors carry the status and never the token", async () => {
  const gh = fakeGitHub([]);
  const client = createGitHubIssuesClient({ repo: "o/r", token: "ghs_secret", fetch: gh.fetch });
  assert.deepEqual(await client.list(), []);
  const created = await applyOpsIssuePlan(planOpsIssue(report("stale"), null, CTX), client);
  assert.deepEqual([created.action, created.number, created.url], ["create", 101, "https://github.com/o/r/issues/101"]);
  const updated = await applyOpsIssuePlan(planOpsIssue(report("failing"), issue({ number: 7, state: "closed" }), CTX), client);
  assert.deepEqual([updated.action, updated.number], ["update", 7]);
  const closed = await applyOpsIssuePlan(planOpsIssue(report("ok"), issue({ number: 7 }), { ...CTX, exitCode: 0 }), client);
  assert.deepEqual([closed.action, closed.number], ["close", 7]);
  const methods = gh.calls.map((c) => `${c.method} ${c.url.replace("https://api.github.com/repos/o/r", "")}`);
  assert.deepEqual(methods, [
    "GET /issues?state=all&per_page=100&sort=updated&direction=desc&page=1",
    "POST /issues",
    "POST /issues/7/comments",
    "PATCH /issues/7",
    "POST /issues/7/comments",
    "PATCH /issues/7",
  ]);
  assert.ok(gh.calls.every((c) => c.auth === "Bearer ghs_secret"));
  assert.deepEqual((gh.calls[3]?.body as Record<string, unknown>)["state"], "open");
  assert.deepEqual((gh.calls[5]?.body as Record<string, unknown>), { state: "closed", state_reason: "completed" });
  assert.throws(() => createGitHubIssuesClient({ repo: "not a repo", token: "t", fetch: gh.fetch }), GitHubIssuesError);
  const failing = createGitHubIssuesClient({ repo: "o/r", token: "ghs_secret", fetch: fakeGitHub([], 403).fetch });
  await assert.rejects(failing.list(), (e: unknown) => e instanceof GitHubIssuesError && e.status === 403 && /HTTP 403/.test(e.message) && !/ghs_secret/.test(e.message));
});

test("ops-issue-sync tool: args, report reading (absent / invalid → unknown), dry run prints the plan without a token, a live sync applies it, GitHub errors exit 1", async () => {
  assert.throws(() => parseSyncArgs([]), SyncUsageError);
  assert.throws(() => parseSyncArgs(["--exit-code", "x"]), SyncUsageError);
  const dir = await mkdtemp(join(tmpdir(), "cc-ops-issue-"));
  const good = join(dir, "ops.json");
  await writeFile(good, JSON.stringify({ ...report("stale", ["last completed run 20 h ago"]), text: "[CC ops] …" }));
  await writeFile(join(dir, "bad.json"), "{ not json");
  assert.equal(await readOpsReport(join(dir, "missing.json")), null);
  assert.equal(await readOpsReport(join(dir, "bad.json")), null);
  assert.equal((await readOpsReport(good))?.status, "stale");

  const out: string[] = [];
  const dry = parseSyncArgs(["--exit-code", "1", "--report", good, "--repo", "o/r", "--dry-run", "--json"]);
  assert.equal(await syncOpsIssue(dry, {}, (l) => out.push(l), { fetch: fakeGitHub([]).fetch, now: NOW }), 0);
  const dryOut = JSON.parse(out[0] ?? "{}") as { dry_run: boolean; state: string; plan: { action: string } };
  assert.deepEqual([dryOut.dry_run, dryOut.state, dryOut.plan.action], [true, "stale", "create"]);

  await assert.rejects(syncOpsIssue(parseSyncArgs(["--exit-code", "1", "--repo", "o/r"]), {}, () => {}, { fetch: fakeGitHub([]).fetch }), SyncUsageError);
  await assert.rejects(syncOpsIssue(parseSyncArgs(["--exit-code", "1"]), { GITHUB_TOKEN: "t" }, () => {}, { fetch: fakeGitHub([]).fetch }), SyncUsageError);

  out.length = 0;
  const gh = fakeGitHub([issue({ number: 7 })]);
  const live = parseSyncArgs(["--exit-code", "0", "--report", good, "--run-url", "https://github.com/o/r/actions/runs/2", "--json"]);
  await writeFile(good, JSON.stringify({ ...report("ok"), text: "ok" }));
  assert.equal(await syncOpsIssue(live, { GITHUB_TOKEN: "ghs_secret", GITHUB_REPOSITORY: "o/r" }, (l) => out.push(l), { fetch: gh.fetch, now: NOW }), 0);
  const liveOut = JSON.parse(out[0] ?? "{}") as { state: string; plan: { action: string; number: number }; result: { action: string; number: number } };
  assert.deepEqual([liveOut.state, liveOut.plan.action, liveOut.result.action, liveOut.result.number], ["ok", "close", "close", 7]);
  assert.ok(out.join("\n").indexOf("ghs_secret") === -1);

  out.length = 0;
  assert.equal(await syncOpsIssue(live, { GITHUB_TOKEN: "ghs_secret", GITHUB_REPOSITORY: "o/r" }, (l) => out.push(l), { fetch: fakeGitHub([], 500).fetch, now: NOW }), 1);
  assert.match(out[0] ?? "", /HTTP 500/);
  assert.ok(out.join("\n").indexOf("ghs_secret") === -1);
});


test("GitHub client pagination: a full first page without the alarm walks on; an open alarm issue stops the walk; a closed one does not; maxPages caps it", async () => {
  const filler = (from: number, count: number, extra: Partial<OpsIssueRef> = {}) => Array.from({ length: count }, (_, i) => ({ number: from + i, state: "open", title: `other ${from + i}`, body: "unrelated", ...extra }));
  // Page 1 full of other issues, page 2 holds the alarm: found after two requests.
  const sunk = fakeGitHub(filler(1000, 100), undefined, [[...filler(500, 30), issue({ number: 7 })]]);
  const client = createGitHubIssuesClient({ repo: "o/r", token: "t", fetch: sunk.fetch });
  const rows = await client.list();
  assert.equal(rows.length, 131);
  assert.equal(findOpsIssue(rows)?.number, 7);
  assert.equal(sunk.calls.length, 2);
  // An open alarm issue on a full first page stops the walk after one request.
  const early = fakeGitHub([issue({ number: 7 }), ...filler(2000, 99)], undefined, [filler(3000, 100)]);
  assert.equal((await createGitHubIssuesClient({ repo: "o/r", token: "t", fetch: early.fetch }).list()).length, 100);
  assert.equal(early.calls.length, 1);
  // A closed alarm issue on page 1 does not stop the walk: the open one on page 2 wins.
  const closedFirst = fakeGitHub([issue({ number: 5, state: "closed" }), ...filler(2000, 99)], undefined, [[issue({ number: 9 })]]);
  const found = findOpsIssue(await createGitHubIssuesClient({ repo: "o/r", token: "t", fetch: closedFirst.fetch }).list());
  assert.deepEqual([found?.number, closedFirst.calls.length], [9, 2]);
  // maxPages bounds the walk when every page is full.
  const endless = fakeGitHub(filler(1, 100), undefined, [filler(101, 100), filler(201, 100), filler(301, 100)]);
  assert.equal((await createGitHubIssuesClient({ repo: "o/r", token: "t", fetch: endless.fetch, maxPages: 2 }).list()).length, 200);
  assert.equal(endless.calls.length, 2);
});
