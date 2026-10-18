import { test } from "node:test";
import assert from "node:assert/strict";
import { createLogger, redact, MAX_STRING_LENGTH } from "../src/index.ts";

function capture() {
  const lines: Record<string, unknown>[] = [];
  const logger = createLogger({
    name: "test",
    level: "debug",
    sink: (line) => lines.push(JSON.parse(line) as Record<string, unknown>),
    clock: () => new Date("2026-10-18T00:45:00Z"),
  });
  return { lines, logger };
}

test("emits one JSON object per line with ts, level, name and msg", () => {
  const { lines, logger } = capture();
  logger.info("hello", { runId: "r1" });
  assert.deepEqual(lines[0], { ts: "2026-10-18T00:45:00.000Z", level: "info", name: "test", msg: "hello", runId: "r1" });
});

test("redacts credential-looking keys at any depth, including arrays", () => {
  const { lines, logger } = capture();
  logger.warn("auth", {
    SUPABASE_SERVICE_ROLE_KEY: "svc-value",
    headers: { Authorization: "Bearer abc", "x-api-key": "k" },
    list: [{ token: "t", ok: "fine" }],
  });
  const entry = lines[0] as Record<string, unknown>;
  assert.equal(entry["SUPABASE_SERVICE_ROLE_KEY"], "[redacted]");
  assert.deepEqual(entry["headers"], { Authorization: "[redacted]", "x-api-key": "[redacted]" });
  assert.deepEqual(entry["list"], [{ token: "[redacted]", ok: "fine" }]);
  assert.ok(!JSON.stringify(lines).includes("svc-value"));
});

test("keeps usage counters and ordinary words readable while redacting credential keys", () => {
  const { lines, logger } = capture();
  logger.info("usage", {
    usage: { inputTokens: 12, outputTokens: 3, cacheReadTokens: 0 },
    output_tokens: 3,
    maxOutputTokens: 100,
    secretary: "ok",
    keyword: "ok",
    apiKey: "x",
    client_secret: "x",
    credentials: "x",
    passwordHash: "x",
  });
  const entry = lines[0] as Record<string, unknown>;
  assert.deepEqual(entry["usage"], { inputTokens: 12, outputTokens: 3, cacheReadTokens: 0 });
  assert.equal(entry["output_tokens"], 3);
  assert.equal(entry["maxOutputTokens"], 100);
  assert.equal(entry["secretary"], "ok");
  assert.equal(entry["keyword"], "ok");
  for (const key of ["apiKey", "client_secret", "credentials", "passwordHash"]) assert.equal(entry[key], "[redacted]", key);
});

test("truncates long strings so source bodies cannot flood logs", () => {
  const long = "x".repeat(MAX_STRING_LENGTH + 50);
  const out = redact({ body: long }) as { body: string };
  assert.ok(out.body.length < long.length);
  assert.ok(out.body.endsWith("[truncated 50]"));
});

test("respects level and child fields", () => {
  const lines: string[] = [];
  const logger = createLogger({ name: "lvl", level: "warn", sink: (line) => lines.push(line) }).child({ stage: "ingest" });
  logger.info("dropped");
  logger.error("kept", { count: 1 });
  assert.equal(lines.length, 1);
  const entry = JSON.parse(lines[0] ?? "{}") as Record<string, unknown>;
  assert.equal(entry["stage"], "ingest");
  assert.equal(entry["count"], 1);
});

test("serializes errors without losing the message", () => {
  const out = redact(new Error("boom")) as { name: string; message: string };
  assert.equal(out.name, "Error");
  assert.equal(out.message, "boom");
});
