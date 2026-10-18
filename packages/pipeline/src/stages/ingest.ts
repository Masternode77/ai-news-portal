/**
 * ingest — Phase 2 skeleton. Calls the source adapter for every enabled source
 * and isolates failures at two levels (P5): a failing source and a malformed
 * item each become a dead letter while the run continues. Parsing, extraction,
 * health updates and the raw_items upsert arrive with Phase 3a.
 */
import { RawItemInsert } from "@cc/shared";
import type { Stage, StageContext } from "@cc/shared";
import type { RawItemInsert as RawItemInsertType } from "@cc/shared";
import { IngestInput, IngestOutput } from "./types.ts";
import { defineStageSpec } from "./spec.ts";

function errorMessage(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

function itemRef(item: unknown, sourceId: string, index: number): string {
  const url = item && typeof item === "object" ? (item as { canonical_url?: unknown }).canonical_url : undefined;
  return typeof url === "string" && url.length > 0 ? url.slice(0, 512) : `${sourceId}#${index}`;
}

export const ingestStage: Stage<IngestInput, IngestOutput> = {
  name: "ingest",
  input: IngestInput,
  output: IngestOutput,
  idempotencyKey: (input) => `ingest:${input.sources.map((s) => s.id).sort().join(",")}`,
  async run(input, ctx: StageContext) {
    const enabled = input.sources.filter((source) => source.enabled);
    const rawItems: RawItemInsertType[] = [];
    const errors: { source_id: string; error: string }[] = [];
    let ok = 0;
    let invalidItems = 0;
    for (const source of enabled) {
      const adapter = ctx.adapters.sources[source.type];
      if (!adapter) {
        const error = `NO_ADAPTER: no source adapter registered for type "${source.type}"`;
        errors.push({ source_id: source.id, error });
        await ctx.ledger.deadLetter({ run_id: ctx.runId, stage: "ingest", ref_table: "sources", ref_id: source.id, payload: { url: source.url }, error });
        continue;
      }
      let items: unknown[];
      try {
        items = await adapter.fetch(source, ctx);
      } catch (error) {
        const message = errorMessage(error);
        errors.push({ source_id: source.id, error: message });
        ctx.logger.warn("source failed; continuing", { source_id: source.id, error: message });
        await ctx.ledger.deadLetter({ run_id: ctx.runId, stage: "ingest", ref_table: "sources", ref_id: source.id, payload: { url: source.url }, error: message });
        continue;
      }
      ok += 1;
      let accepted = 0;
      for (const [index, item] of items.entries()) {
        const parsed = RawItemInsert.safeParse(item);
        if (parsed.success) {
          rawItems.push(parsed.data);
          accepted += 1;
          continue;
        }
        invalidItems += 1;
        const error = `ITEM_INVALID: ${parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")}`;
        await ctx.ledger.deadLetter({
          run_id: ctx.runId,
          stage: "ingest",
          ref_table: "raw_items",
          ref_id: itemRef(item, source.id, index),
          payload: { source_id: source.id, index },
          error,
        });
      }
      ctx.logger.debug("source fetched", { source_id: source.id, items: accepted, invalid: items.length - accepted });
    }
    return { rawItems, stats: { configured: enabled.length, ok, failed: errors.length, invalid_items: invalidItems, errors } };
  },
};

export const ingestSpec = defineStageSpec({
  stage: ingestStage,
  select: (state) => ({ sources: state.sources }),
  merge: (state, output) => ({ ...state, rawItems: output.rawItems, sourceStats: output.stats }),
  counts: (output) => ({
    sources_configured: output.stats.configured,
    sources_ok: output.stats.ok,
    sources_failed: output.stats.failed,
    items_fetched: output.rawItems.length,
    items_invalid: output.stats.invalid_items,
  }),
});
