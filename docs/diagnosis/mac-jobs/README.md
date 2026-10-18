# Mac subscription job records (evidence drop zone)

Phase 0 cannot see the Mac runner's job records from the cloud session. Copy
them here so `scripts/diagnose/funnel.mjs --jobs docs/diagnosis/mac-jobs`
can add the runs that never reached `scripts/state/pipeline-state.json`
(a run that aborts in the column stage exits before the ledger write,
`scripts/pipeline.mjs:445`).

## What to copy

On the Mac, from the coordinator checkout:

```sh
# macOS / Linux shell
cd "$(git rev-parse --git-common-dir)/subscription-jobs"
mkdir -p /tmp/cc-mac-jobs
for f in *.json; do
  jq 'del(.lock_owner, .workspace)' "$f" > "/tmp/cc-mac-jobs/$f"
done
```

Then add the files from `/tmp/cc-mac-jobs/` to this directory and commit.
`lock_owner` and `workspace` are removed on purpose: the first is a lock
secret, the second is a local machine path. `scripts/diagnose/funnel.mjs`
also drops those two keys if they slip through, but do not rely on that.

Optional: the Codex task's stdout logs (`/tmp/compute-current-subscription-*.log`
or wherever the task keeps them) can go into `docs/diagnosis/logs/` with the
same redaction rules.

## Record schema (from `scripts/subscription-job.mjs`)

| key | meaning |
|---|---|
| `id` | job UUID |
| `status` | `starting`, `started`, `generating`, `awaiting_artwork`, `failed`, `published`, `no_change` |
| `stage` | the `SUBSCRIPTION_NEWS_STEPS` command that was running (`scripts/run-subscription-news.mjs:15-27`) |
| `started_at`, `finished_at`, `updated_at` | ISO timestamps |
| `base_commit` | verified production SHA the job started from |
| `published_commit` | SHA pushed when `status: published` |
| `last_error` | bounded failure reason |

Nothing in this directory is read by the site or the pipeline.
