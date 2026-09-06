# Content Cycle Runbook

The offline-safe content cycle command is:

```bash
npm run content:cycle
```

It runs `scripts/run-content-cycle.mjs` with `PIPELINE_OFFLINE=1`, the mixed fixture, and `.cache/content-cycle` as the output directory. The scheduled wrapper is `scripts/schedule-content-cycle.mjs`, controlled by `CONTENT_CYCLE_FIXTURE`.

## Normal Local Flow

1. Set `.env` from `.env.example`.
2. Run `npm run content:cycle`.
3. Inspect `.cache/content-cycle` output and the admin review queue.
4. Run `npm run content:gate`.

## Failure Handling

If generation fails, items must go to the admin review queue with a regeneration-needed reason. Use this dry-run path to verify the failure branch:

```bash
FORCE_GENERATION_FAILURE=1 PIPELINE_OFFLINE=1 node scripts/run-content-cycle.mjs --fixture tests/fixtures/content-cycle-one.json --dry-run-json
```

Low-relevance, weak extraction, missing image, and generation failure paths should not publish directly.

## Cache Purge

After publishing or regenerating a batch, prepare the cache-purge follow-up. Run the following command only when the purge action and target are explicitly authorized, its credentials are available through permitted access, and the rollback prerequisites in the [automation runbook](automation-runbook.md) are satisfied:

```bash
npm run purge:cache
```

Production purges require `COMPUTE_CURRENT_CACHE_PURGE_URL`. Optional bearer auth uses `COMPUTE_CURRENT_CACHE_PURGE_TOKEN`.

A regeneration or draft request alone does not authorize a purge. Otherwise record the purge as not performed and continue independent local verification under [`AGENTS.md`](../AGENTS.md); do not claim live freshness from local results.

`VERCEL_DEPLOY_HOOK_URL` is a deployment trigger, not a cache-purge endpoint; do not use it for purge runs.
