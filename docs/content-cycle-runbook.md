# Content Cycle Runbook

## Canonical commands

The scheduled production lifecycle is explicit:

```bash
npm run content:cycle
```

`content:cycle` supplies the required `--production` boundary through `package.json`. It runs
the seven registered providers in order:

```text
ingest -> extract -> classify -> cluster -> generate -> review -> publish
```

The compatibility command `npm run pipeline` invokes the same composition root. It does not
contain a second implementation.

## Phase and resume flow

Each phase can run independently against the durable checkpoint:

```bash
npm run content:ingest
npm run content:extract
npm run content:classify
npm run content:cluster
npm run content:generate
npm run content:review
npm run content:publish
```

The default checkpoint is `.cache/content-cycle/checkpoint.json`. The publish provider also
keeps `.cache/content-cycle/publication-receipts.json` as an atomic sidecar journal. Override
either only with a trusted local path:

```bash
CONTENT_CYCLE_CHECKPOINT_PATH=.cache/content-cycle/manual.json npm run content:ingest
CONTENT_PUBLICATION_RECEIPT_PATH=.cache/content-cycle/manual-receipts.json npm run content:publish
```

Phases reject out-of-order execution. A completed phase returns a replay receipt without
calling its provider again. A failed cycle records the failed phase and resumes there when
the same command or `content:cycle` is rerun. A checkpoint whose `pipelineVersion` differs
from the running composition fails closed; inspect and deliberately abandon or migrate it
instead of replaying state across incompatible versions.

The scheduled GitHub job restores and saves the whole `.cache/content-cycle` directory with
`actions/cache`. The save step uses `if: always()` so both the failed provider checkpoint and
the publication receipt journal survive the ephemeral runner and can resume on the next
serialized job. Cache namespace `content-cycle-v2` prevents pre-bundle checkpoints from being
replayed by pipeline version `5.6.2`.

## Quality behavior

- Extraction failure remains in lifecycle evidence and cannot reach public long form.
- Clean relevant evidence below the long-form threshold becomes a source-linked Source Signal.
- Editorial AI failure never triggers deterministic fallback long form.
- Generation or review failure transitions through `review_failed` and becomes Source Signal.
- Review reuses the generation evidence pack and persists source, claim, and SEO fidelity results.
- Only `content:publish` writes the public read-model JSON and archive/search artifacts.
- Publish writes a `preparing` receipt to the cached atomic sidecar and mirrors it into
  `scripts/state/pipeline-state.json` before public side effects, then records `completed` with
  counts in both stores. Before completing the durable receipt it captures the public JSON,
  pipeline state, and referenced generated images in a SHA-256 output bundle. A fresh runner
  verifies or restores that bundle before a new cycle can begin.
- A completed receipt is reusable only when its run ID, pipeline version, and output-manifest
  run ID all match the active cycle. Any mismatch fails before public writes.
- The optional Supabase archive mirror is not authoritative for the Astro publication. Mirror
  failures are recorded in the publication result while tracked JSON remains the rollback source.

After a successful cycle, run:

```bash
npm run content:gate
```

Inspect the checkpoint's provider receipts, transitions, publication counts, and run ID before
committing generated data. Do not include `.cache/` in a release commit.

## Failure recovery

1. Read `failure.phase`, `failure.providerId`, and `failure.code` in the checkpoint.
2. Repair the provider/configuration issue without deleting the checkpoint.
3. Rerun the failed phase or `npm run content:cycle`.
4. Confirm earlier receipts were replayed and the same run ID completed.
5. If publish may have completed before the checkpoint was saved, inspect the cached
   `publication-receipts.json` and mirrored `publicationReceipts[runId]`; `completed` reconciles
   tracked state without public rewrites, while `preparing` repeats only idempotent public
   upserts and writes.
6. For a completed checkpoint, verify the matching
   `publication-bundles/<runId>/manifest.json`; a missing or invalid bundle fails closed.
7. Run `npm run content:gate` before preview deployment.

Delete a checkpoint only when intentionally abandoning the entire unpublished run. Keep the
prior public JSON revision as the rollback surface.

## Deployment boundary

This runbook does not authorize production deployment, secret changes, or cache purge. Preview
deployment and production promotion remain separate release actions. Cache purge is excluded
unless explicitly approved.
