import { test } from "node:test";
import assert from "node:assert/strict";

test("GET /healthz renders with zero published items when SITE_DATA_SOURCE=empty", async () => {
  process.env["SITE_DATA_SOURCE"] = "empty";
  const { GET } = await import("../src/pages/healthz.ts");
  const response = await GET({} as never);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const body = (await response.json()) as { ok: boolean; source: string; publishedCount: number; checkedAt: string };
  assert.equal(body.ok, true);
  assert.equal(body.source, "empty");
  assert.equal(body.publishedCount, 0);
  assert.ok(body.checkedAt);
});
