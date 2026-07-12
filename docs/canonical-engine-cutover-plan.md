# Canonical Engine Cutover Plan

Updated: 2026-07-12

## Objective

Replace the production-only `scripts/pipeline.mjs` orchestration with one registry-driven,
phase-addressable content engine. Preserve the proven source, extraction, relevance, image,
review, and publication primitives behind providers; remove their ability to form a second
production lifecycle.

## Behavior Lock

Before the cutover, tests must preserve these boundaries:

- the phase order is ingest, extract, classify, cluster, generate, review, publish;
- a phase can be run alone only after every predecessor has a durable checkpoint;
- a failed phase can be retried without replaying completed providers;
- every article state change is a validated canonical transition with actor, reason, pipeline
  version, source version, article version, idempotency key, and correlation ID;
- publish is idempotent by cycle ID and is the only phase allowed to mutate public JSON;
- missing editorial generation never creates fallback longform and downgrades to Source Signal;
- the core orchestrator imports contracts, registry, and state only, never concrete providers;
- `scripts/pipeline.mjs` and legacy command names cannot execute an independent lifecycle.

## Target Structure

| Surface | Responsibility |
| --- | --- |
| `src/core/orchestrator/content-cycle-orchestrator.mjs` | Generic phase sequencing, retries, receipts, transition journal |
| `src/core/state/file-cycle-checkpoint-store.mjs` | Atomic resumable checkpoint persistence |
| `src/core/state/file-publication-receipt-store.mjs` | Atomic cross-runner publication receipt journal |
| `src/core/state/file-publication-output-bundle-store.mjs` | SHA-256 output capture, verification, and restoration |
| `src/adapters/content-cycle-composition.mjs` | Application composition root and provider registration |
| `src/plugins/sources/` | Feed discovery and source extraction providers |
| `src/plugins/editorial/` | Classification, clustering, generation, and review providers |
| `src/plugins/publishing/` | Idempotent public JSON publication provider |
| `scripts/lib/production-content-phases.mjs` | Migrated production primitives used only behind plugins |
| `scripts/content-command-surface.mjs` | Canonical CLI for phase and full-cycle execution |
| `scripts/pipeline.mjs` | Compatibility alias to the same canonical composition |

## Reviewable Steps

1. Add failing core orchestration tests for order, resume, retry, and transition evidence.
2. Implement the generic checkpoint store and orchestrator without provider imports.
3. Extract production behavior into explicit phase functions and add strict generation failure.
4. Register thin provider plugins in one composition root.
5. Route every canonical command and the pipeline compatibility name through the composition.
6. Disable independent legacy generation command writes or convert them to explicit wrappers.
7. Run targeted tests, full tests, check, build, content gate, and dependency audit.
8. Deploy the exact implementation SHA to preview and repeat route and rendered-image QA.

## Risks And Controls

- **Partial publication:** publish records a preparing receipt before public side effects, writes
  tracked state, captures a byte-level output bundle, then completes the durable receipt. A
  completed checkpoint cannot start another cycle until the receipt and bundle verify or restore;
  preparing retries use stable article IDs and repeat-safe archive/file upserts.
- **Checkpoint loss or corruption:** writes use temp-file rename, strict phase-prefix/schema
  validation, and pipeline-version checks. GitHub restores and preserves the checkpoint through
  an always-run cache-save step, including provider failures.
- **Generation outage:** review receives a typed generation failure and routes the item to a
  source-linked signal rather than synthesizing a deterministic article.
- **Behavior drift:** existing extraction, relevance, repetition, image, and archive tests remain
  active; new tests cover the orchestration boundary.
- **Rollback:** stop the scheduler, isolate the v2 cache namespace, restore the exact tracked
  JSON/state revision, reconcile the external archive, deploy the known-good tag, and resume only
  after the public hashes and route smoke tests pass.

## Out Of Scope For This Cutover

Managed preview Postgres/Blob credentials and independent 150-item relevance / 40-item writing
labels remain external acceptance conditions. This cutover does not promote production, purge
cache, use production secrets, or merge the branch.
