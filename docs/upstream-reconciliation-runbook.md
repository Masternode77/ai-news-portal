# Upstream Reconciliation Runbook

This runbook covers the guarded re-ingestion of source-only candidates from an audited upstream
revision. It does not merge upstream generated JSON, generated images, copy, scores, or routing.

## Required Boundary

Run the command only in a clean preview content-refresh workspace. It requires all of the following:

- `OPENROUTER_API_KEY` for source-grounded editorial generation.
- `IMAGE_PROVIDER=image2`.
- `OPENAI_API_KEY` for remote Image2 generation.
- Online provider access; `PIPELINE_OFFLINE=1` and `CODEX_SANDBOX_NETWORK_DISABLED=1` are rejected.

The command checks these requirements before loading a checkpoint, auditing upstream content, or
starting the canonical cycle. Do not put secret values in a command transcript, report, commit, or
screenshot.

## Read-Only Preflight

```bash
git status --short
npm run audit:upstream-content -- --revision=origin/main --json
npm run audit:integration -- --revision=origin/main
```

Confirm the resolved full commit SHA, candidate count, zero rejected discovery rows, registered source
domains, and a clean working tree. Integration conflicts in generated projections or images must be
resolved by this lifecycle and regenerated outputs, never by accepting either JSON side directly.

## Execute

```bash
npm run content:reconcile-upstream -- --execute --production --revision=origin/main
```

Here `--production` enables the canonical content-cycle publication phase in the isolated refresh
workspace. It is not permission to promote a Vercel deployment or modify the production domain.

The execution is accepted only when both explicit flags are present, the provider preflight passes,
the batch is no larger than 30 candidates, and at least one source passes extraction QA. The revision
and canonical candidate fingerprint bind the checkpoint, lease, output bundle, and publication receipt.

## Failure Recovery

- Provider preflight failure creates no checkpoint and performs no content or image writes.
- If every fetch fails, the extract phase fails with `reconciliation_extraction_empty`.
- If no extracted source passes QA, classify fails with `reconciliation_classification_empty`.
- Editorial or Image2 provider failure aborts reconciliation; no source/local image fallback is accepted.
- Every reconciled public update must have four distinct canonical Image2 WebPs that exist as regular
  files before publication state is touched, and all four paths must enter the durable output bundle.
- Checkpoints from pipeline versions before `5.6.2` are rejected and must not be manually rewritten.
- For a failed checkpoint, repair preview-only connectivity or credentials and rerun the exact same
  revision. The immutable input is resumed before any changed local audit is considered.
- Do not delete or reclaim a checkpoint/lease unless its owner is confirmed dead and the explicit
  operator cleanup procedure is being followed.

## Acceptance

After a completed receipt:

```bash
npm run check
npm test
npm run content:gate
npm run audit:integration -- --revision=origin/main
```

Review the new longform and signal records, image provenance, source fidelity, repetition results,
homepage/archive rendering, and regenerated conflict set. Deploy only a new preview. Production
promotion, production secrets, cache purge, push, PR, and merge remain separate approval gates.
