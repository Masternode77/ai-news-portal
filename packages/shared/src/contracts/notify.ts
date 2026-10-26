/**
 * Notifier port (Phase 3i, ADR-007): one message per run end. The transport
 * sits behind this interface so the CLI never names a provider, and a
 * delivery failure is reported in the result, never thrown (soft).
 */
import type { RunStatus } from "../schema/index.ts";
import type { Logger } from "../logger.ts";

export type NotifyKind = "run_summary" | "run_failure";

export interface NotifyMessage {
  kind: NotifyKind;
  runId: string;
  status: Exclude<RunStatus, "started">;
  /** Plain text in the ADR-007 layout (no parse mode). */
  text: string;
}

export type NotifySkipReason = "disabled" | "status_filtered";

export interface NotifyResult {
  channel: string;
  sent: boolean;
  skipped: NotifySkipReason | null;
  attempts: number;
  /** `<CODE>: <detail>` when neither sent nor skipped; never carries a credential. */
  error: string | null;
  ms: number;
}

export interface NotifyContext {
  /** The only way to the network (same rule as StageContext.fetch): it throws in --replay, so a replay records a failed delivery. */
  fetch: typeof globalThis.fetch;
  logger: Logger;
}

export interface Notifier {
  readonly channel: string;
  send(message: NotifyMessage, ctx: NotifyContext): Promise<NotifyResult>;
}
