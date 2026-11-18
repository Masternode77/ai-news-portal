import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { auditAdvisories, auditGate, parseAllowlist } from "../tools/audit-gate.ts";
import { REPO_ROOT } from "./helpers.ts";

const REPORT = {
  vulnerabilities: {
    picomatch: { via: [{ source: 1, name: "picomatch", severity: "high", url: "https://github.com/advisories/GHSA-fc5q-39xc-vjpf", range: "<=4.0.7" }] },
    anymatch: { via: ["picomatch"] },
    vite: { via: ["picomatch", { source: 2, name: "vite", severity: "moderate", url: "https://github.com/advisories/GHSA-aaaa-bbbb-cccc", range: "<8" }] },
    other: { via: [{ source: 3, name: "other", severity: "critical", url: "https://github.com/advisories/GHSA-zzzz-yyyy-xxxx", range: "*" }] },
  },
};
const ENTRY = { id: "GHSA-fc5q-39xc-vjpf", package: "picomatch", reason: "no patched release yet; build-time globbing only", expires: "2026-12-15" };

test("auditAdvisories: one entry per advisory object, dependents' string vias are not advisories", () => {
  const advisories = auditAdvisories(REPORT);
  assert.deepEqual(advisories.map((a) => [a.id, a.severity, a.package]), [["GHSA-fc5q-39xc-vjpf", "high", "picomatch"], ["GHSA-aaaa-bbbb-cccc", "moderate", "vite"], ["GHSA-zzzz-yyyy-xxxx", "critical", "other"]]);
  assert.throws(() => auditAdvisories({ error: "network" }), /AUDIT_REPORT_INVALID/);
});

test("auditGate: an allowlisted high advisory passes until its expiry, anything else high or critical blocks, moderate is not gated", () => {
  const advisories = auditAdvisories(REPORT);
  const blocked = auditGate(advisories, [ENTRY], "2026-11-18");
  assert.equal(blocked.ok, false);
  assert.deepEqual(blocked.blocking.map((a) => a.id), ["GHSA-zzzz-yyyy-xxxx"]);
  assert.deepEqual(blocked.allowed.map((a) => a.advisory.id), ["GHSA-fc5q-39xc-vjpf"]);
  const onlyPicomatch = advisories.filter((a) => a.package !== "other");
  assert.equal(auditGate(onlyPicomatch, [ENTRY], "2026-12-15").ok, true, "valid through the expiry day");
  const expired = auditGate(onlyPicomatch, [ENTRY], "2026-12-16");
  assert.equal(expired.ok, false);
  assert.equal(expired.expired[0]?.entry.expires, "2026-12-15");
  const fixed = auditGate([], [ENTRY], "2026-11-18");
  assert.equal(fixed.ok, true);
  assert.deepEqual(fixed.unused.map((e) => e.id), ["GHSA-fc5q-39xc-vjpf"], "a fixed advisory leaves an unused entry to remove");
});

test("the committed allowlist parses; entries need an id, a real reason and a date", async () => {
  const committed = parseAllowlist(JSON.parse(await readFile(resolve(REPO_ROOT, "config/audit-allowlist.json"), "utf8")));
  assert.deepEqual(committed.map((e) => [e.id, e.expires]), [["GHSA-fc5q-39xc-vjpf", "2026-12-15"]]);
  assert.throws(() => parseAllowlist({ advisories: [{ ...ENTRY, reason: "ok" }] }), /AUDIT_ALLOWLIST_INVALID/);
  assert.throws(() => parseAllowlist({ advisories: [{ ...ENTRY, expires: "soon" }] }), /AUDIT_ALLOWLIST_INVALID/);
  assert.throws(() => parseAllowlist({}), /AUDIT_ALLOWLIST_INVALID/);
});
