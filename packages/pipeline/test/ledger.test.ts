import { test } from "node:test";
import assert from "node:assert/strict";
import { MemoryLedger, SupabaseLedger } from "../src/ledger/index.ts";
import type { SupabaseLike, SupabaseTable } from "../src/ledger/index.ts";
import { MemoryDb, SupabaseDb } from "../src/db/index.ts";

interface Call {
  table: string;
  op: string;
  args: unknown[];
}

function fakeSupabase(failOn?: string): { client: SupabaseLike; calls: Call[] } {
  const calls: Call[] = [];
  const result = (op: string) => Promise.resolve({ error: failOn === op ? { message: `${op} rejected` } : null, data: [] });
  const client: SupabaseLike = {
    from(table: string): SupabaseTable {
      return {
        insert: (rows) => {
          calls.push({ table, op: "insert", args: [rows] });
          return result("insert");
        },
        upsert: (rows, options) => {
          calls.push({ table, op: "upsert", args: [rows, options] });
          return result("upsert");
        },
        update: (patch) => ({
          match: (filter) => {
            calls.push({ table, op: "update", args: [patch, filter] });
            return result("update");
          },
        }),
        select: () => ({
          match: (filter) => ({
            limit: (count) => {
              calls.push({ table, op: "select", args: [filter, count] });
              return result("select");
            },
          }),
        }),
      };
    },
  };
  return { client, calls };
}

test("MemoryLedger records start, stage events, dead letters and finish", async () => {
  const ledger = new MemoryLedger();
  const runId = await ledger.startRun({ trigger: "local", startedAt: new Date("2026-10-18T00:45:00Z"), gitSha: null, flags: {} });
  await ledger.stageStarted(runId, "ingest", new Date("2026-10-18T00:45:01Z"));
  await ledger.deadLetter({ run_id: runId, stage: "ingest", ref_table: "sources", ref_id: "x", payload: {}, error: "boom" });
  await ledger.stageFinished(runId, "ingest", new Date("2026-10-18T00:45:02Z"), { status: "done", counts: { items_fetched: 1 } });
  const before = await ledger.dump();
  assert.equal(before.runs[0]?.status, "started", "run row exists before finish");
  await ledger.finishRun(runId, new Date("2026-10-18T00:46:00Z"), {
    status: "partial",
    funnel: {
      run_id: runId,
      started_at: "2026-10-18T00:45:00.000Z",
      sources_configured: 1,
      sources_ok: 0,
      sources_failed: 1,
      items_fetched: 1,
      items_new: 0,
      items_scored: 0,
      passed_gate: 0,
      drafts: 0,
      qa_passed: 0,
      published: 0,
      top_error: "boom",
    },
    costTotalUsd: 0.5,
  });
  const dump = await ledger.dump();
  assert.equal(dump.runs[0]?.status, "partial");
  assert.equal(dump.runs[0]?.cost_total_usd, 0.5);
  assert.equal(dump.stageEvents[0]?.status, "done");
  assert.equal(dump.deadLetters[0]?.retry_count, 0);
  await assert.rejects(ledger.stageFinished(runId, "qa", new Date(), { status: "done", counts: {} }), /no open event/);
  await assert.rejects(ledger.stageStarted("nope", "qa", new Date()), /unknown run/);
});

test("SupabaseLedger issues the expected writes in order and surfaces errors", async () => {
  const { client, calls } = fakeSupabase();
  const ledger = new SupabaseLedger(client);
  const runId = await ledger.startRun({ trigger: "schedule", startedAt: new Date("2026-10-18T00:45:00Z"), gitSha: "abc", flags: { a: 1 } });
  await ledger.stageStarted(runId, "ingest", new Date());
  await ledger.stageFinished(runId, "ingest", new Date(), { status: "done", counts: { items_fetched: 3 } });
  await ledger.finishRun(runId, new Date(), {
    status: "done",
    funnel: {
      run_id: runId,
      started_at: "2026-10-18T00:45:00.000Z",
      sources_configured: 0,
      sources_ok: 0,
      sources_failed: 0,
      items_fetched: 3,
      items_new: 0,
      items_scored: 0,
      passed_gate: 0,
      drafts: 0,
      qa_passed: 0,
      published: 0,
      top_error: null,
    },
    costTotalUsd: 0,
  });
  assert.deepEqual(
    calls.map((c) => `${c.table}.${c.op}`),
    ["pipeline_runs.insert", "stage_events.insert", "stage_events.update", "pipeline_runs.update"],
  );
  const first = calls[0]?.args[0] as Record<string, unknown>[];
  assert.equal(first[0]?.["status"], "started");
  assert.equal(first[0]?.["id"], runId);
  const stageUpdate = calls[2]?.args[1] as Record<string, unknown>;
  assert.deepEqual(stageUpdate, { run_id: runId, stage: "ingest", status: "started" });

  const failing = new SupabaseLedger(fakeSupabase("insert").client);
  await assert.rejects(failing.startRun({ trigger: "local", startedAt: new Date(), gitSha: null, flags: {} }), /SupabaseLedger.startRun: insert rejected/);
});

test("MemoryDb upsert is idempotent on the conflict keys", async () => {
  const db = new MemoryDb();
  const row = { canonical_url: "https://a.test/1", title: "one" };
  assert.deepEqual(await db.upsert("raw_items", [row], ["canonical_url"]), { inserted: 1, updated: 0 });
  assert.deepEqual(await db.upsert("raw_items", [{ ...row, title: "uno" }], ["canonical_url"]), { inserted: 0, updated: 1 });
  assert.equal(db.size("raw_items"), 1);
  assert.equal((await db.select<{ title: string }>("raw_items", { canonical_url: row.canonical_url }))[0]?.title, "uno");
  assert.equal(await db.update("raw_items", { title: "uno" }, { title: "two" }), 1);
  await assert.rejects(db.upsert("raw_items", [row], []), /conflictKeys/);
});

test("SupabaseDb maps port operations onto the client", async () => {
  const { client, calls } = fakeSupabase();
  const db = new SupabaseDb(client);
  await db.insert("sources", [{ id: "a" }]);
  await db.upsert("raw_items", [{ canonical_url: "u" }], ["canonical_url"]);
  await db.select("publications", { status: "published" }, { limit: 5 });
  await db.update("sources", { id: "a" }, { enabled: false });
  assert.deepEqual(
    calls.map((c) => `${c.table}.${c.op}`),
    ["sources.insert", "raw_items.upsert", "publications.select", "sources.update"],
  );
  assert.deepEqual(calls[1]?.args[1], { onConflict: "canonical_url" });
  assert.deepEqual(calls[2]?.args, [{ status: "published" }, 5]);
});
