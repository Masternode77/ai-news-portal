/**
 * audit-gate — the production dependency audit with dated exceptions (rebuild-ci, Josh 2026-11-18). It reads
 * `npm audit --omit=dev --json` and `config/audit-allowlist.json` and fails when a high or critical advisory is
 * not allowlisted, or is allowlisted past its `expires` date. Allowlist entries that no longer match anything are
 * reported so they can be removed. A report that does not parse fails closed.
 *
 *   npm audit --omit=dev --json > audit.json || true
 *   node packages/pipeline/tools/audit-gate.ts --audit audit.json --allow config/audit-allowlist.json [--today YYYY-MM-DD]
 */
import { readFile } from "node:fs/promises";
import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

export interface AuditAdvisory {
  id: string;
  url: string;
  severity: string;
  package: string;
  range: string;
}

export interface AllowEntry {
  id: string;
  package: string;
  reason: string;
  expires: string;
}

export interface GateResult {
  ok: boolean;
  blocking: AuditAdvisory[];
  allowed: { advisory: AuditAdvisory; entry: AllowEntry }[];
  expired: { advisory: AuditAdvisory; entry: AllowEntry }[];
  unused: AllowEntry[];
}

const GATED = new Set(["high", "critical"]);

/** Every advisory object in an npm audit (v2 report) `vulnerabilities[*].via`, once per advisory. */
export function auditAdvisories(report: unknown): AuditAdvisory[] {
  const vulnerabilities = (report as { vulnerabilities?: Record<string, { via?: unknown[] }> } | null)?.vulnerabilities;
  if (!vulnerabilities || typeof vulnerabilities !== "object") throw new Error("AUDIT_REPORT_INVALID: no `vulnerabilities` object (is this `npm audit --json` output?)");
  const seen = new Map<string, AuditAdvisory>();
  for (const vulnerability of Object.values(vulnerabilities)) {
    for (const via of vulnerability.via ?? []) {
      if (!via || typeof via !== "object") continue;
      const record = via as Record<string, unknown>;
      const url = typeof record["url"] === "string" ? record["url"] : "";
      const id = url.split("/").pop() || String(record["source"] ?? "");
      if (!id || seen.has(id)) continue;
      seen.set(id, { id, url, severity: String(record["severity"] ?? ""), package: String(record["name"] ?? ""), range: String(record["range"] ?? "") });
    }
  }
  return [...seen.values()];
}

export function parseAllowlist(raw: unknown): AllowEntry[] {
  const advisories = (raw as { advisories?: unknown } | null)?.advisories;
  if (!Array.isArray(advisories)) throw new Error("AUDIT_ALLOWLIST_INVALID: `advisories` must be an array");
  return advisories.map((entry, index) => {
    const e = entry as Record<string, unknown>;
    const ok = typeof e["id"] === "string" && /^GHSA-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}$/.test(e["id"]) && typeof e["package"] === "string" && typeof e["reason"] === "string" && (e["reason"] as string).trim().length >= 20 && typeof e["expires"] === "string" && /^\d{4}-\d{2}-\d{2}$/.test(e["expires"]);
    if (!ok) throw new Error(`AUDIT_ALLOWLIST_INVALID: advisories[${index}] needs id (GHSA-…), package, a reason of 20+ characters and expires (YYYY-MM-DD)`);
    return { id: e["id"] as string, package: e["package"] as string, reason: e["reason"] as string, expires: e["expires"] as string };
  });
}

/** `today` is a YYYY-MM-DD date; an entry is valid through its `expires` day. */
export function auditGate(advisories: readonly AuditAdvisory[], allow: readonly AllowEntry[], today: string): GateResult {
  const byId = new Map(allow.map((entry) => [entry.id, entry]));
  const result: GateResult = { ok: true, blocking: [], allowed: [], expired: [], unused: [] };
  const matched = new Set<string>();
  for (const advisory of advisories) {
    if (!GATED.has(advisory.severity)) continue;
    const entry = byId.get(advisory.id);
    if (!entry) result.blocking.push(advisory);
    else {
      matched.add(entry.id);
      if (today > entry.expires) result.expired.push({ advisory, entry });
      else result.allowed.push({ advisory, entry });
    }
  }
  result.unused = allow.filter((entry) => !matched.has(entry.id));
  result.ok = result.blocking.length === 0 && result.expired.length === 0;
  return result;
}

function isMainModule(): boolean {
  try {
    return import.meta.url === pathToFileURL(realpathSync(process.argv[1] ?? "")).href;
  } catch {
    return false;
  }
}

if (isMainModule()) {
  const { values } = parseArgs({ args: process.argv.slice(2), options: { audit: { type: "string" }, allow: { type: "string", default: "config/audit-allowlist.json" }, today: { type: "string" } } });
  try {
    if (!values.audit) throw new Error("--audit <npm audit --json output> is required");
    const report = JSON.parse(await readFile(values.audit, "utf8")) as unknown;
    const allow = parseAllowlist(JSON.parse(await readFile(values.allow, "utf8")) as unknown);
    const today = values.today ?? new Date().toISOString().slice(0, 10);
    const result = auditGate(auditAdvisories(report), allow, today);
    for (const a of result.blocking) process.stdout.write(`BLOCKING ${a.severity} ${a.package} ${a.range} ${a.url}\n`);
    for (const { advisory, entry } of result.expired) process.stdout.write(`EXPIRED ${advisory.package} ${advisory.id} (allowlisted until ${entry.expires})\n`);
    for (const { advisory, entry } of result.allowed) process.stdout.write(`allowed ${advisory.severity} ${advisory.package} ${advisory.id} until ${entry.expires}: ${entry.reason}\n`);
    for (const entry of result.unused) process.stdout.write(`unused allowlist entry ${entry.id} (${entry.package}) — remove it\n`);
    process.stdout.write(result.ok ? "audit gate: ok\n" : "audit gate: FAILED\n");
    process.exitCode = result.ok ? 0 : 1;
  } catch (error) {
    process.stderr.write(`audit-gate: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
  }
}
