/**
 * ingest — Phase 2 skeleton. Calls the source adapter for every enabled source
 * and isolates failures per source (P5): a failing source becomes a dead
 * letter and the run continues. Parsing, extraction, health updates and the
 * raw_items upsert arrive with Phase 3a.
 */
import type { Stage, StageContext } from "@cc/shared";
import type { RawItemInsert } from "@cc/shared";
import { IngestInput, IngestOutput } from "./types.ts";
import { defineStageSpec } from "./spec.ts";

function errorMessage(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

export const ingestStage: Stage<IngestInput, IngestOutput> = {
  name: "ingest",
  input: IngestInput,
  output: IngestOutput,
  idempotencyKey: (input) => `ingest:${input.sources.map((s) => s.id).sort().join(",")}`,
  async run(input, ctx: StageContext) {
    const enabled = input.sources.filter((source) => source.enabled);
    const rawItems: RawItemInsert[] = [];
    const errors: { source_id: string; error: string }[] = [];
    let ok = 0;
    for (const source of enabled) {
      const adapter = ctx.adapters.sources[source.type];
      if (!adapter) {
        const error = `NO_ADAPTER: no source adapter registered for type "${source.type}"`;
        errors.push({ source_id: source.id, error });
        await ctx.ledger.deadLetter({ run_id: ctx.runId, stage: "ingest", ref_table: "sources", ref_id: source.id, payload: { url: source.url }, error });
        continue;
      }
      try {
        const items = await adapter.fetch(source, ctx);
        rawItems.push(...items);
        ok += 1;
        ctx.logger.debug("source fetched", { source_id: source.id, items: items.length });
      } catch (error) {
        const message = errorMessage(error);
        errors.push({ source_id: source.id, error: message });
        ctx.logger.warn("source failed; continuing", { source_id: source.id, error: message });
        await ctx.ledger.deadLetter({ run_id: ctx.runId, stage: "ingest", ref_table: "sources", ref_id: source.id, payload: { url: source.url }, error: message });
      }
    }
    return { rawItems, stats: { configured: enabled.length, ok, failed: errors.length, errors } };
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
  }),
});
