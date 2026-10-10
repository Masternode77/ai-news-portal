# Mac column artwork

The Mac's existing Codex task performs native image generation. Git stores the code, instructions and registered images; pulling Git does not install or update an app-local schedule. This repository change is picked up automatically only when that task refreshes its checkout and reads these instructions. A Windows session cannot confirm a disconnected Mac's schedule or its next run.

## Start of each authorized scheduled run

Use the existing repository only as the coordinator checkout. It may contain
user edits or be on another branch; never reset, clean, stash or switch it for a
scheduled run. Resolve the successful production deployment serving
`www.computecurrent.com` with the Vercel connector and require both `READY` and
an exact 40-character `meta.githubCommitSha`. A pending deployment, branch name,
short SHA or local `HEAD` is not an acceptable anchor.

From any checkout in the same repository, start one isolated job with that full
production SHA:

```sh
node scripts/subscription-job.mjs start --ref <production-ready-full-sha>
```

Invoke this command through a structured subprocess and parse its JSON result.
Keep `id`, `workspace` and `owner` in the task's private runtime state; do not
use `eval`, paste the owner into chat, echo it, or interpolate the JSON into a
shell command. `start` fetches `origin`, requires `origin/main` to equal the
verified production SHA, takes the common-Git-directory operation lock, and
creates a detached worktree at the recorded `workspace`. By default the
workspace is below
`~/.local/share/compute-current/subscription-jobs/<repository-id>/<job-id>`.
Job records are stored with restricted permissions in the repository common Git
directory under `subscription-jobs/<job-id>.json`.

Run dependency installation, text generation, native artwork, review, commits
and validation only inside the returned job workspace. Pass the parsed values as
`CC_SUBSCRIPTION_JOB_ID=<id>` and `CC_SUBSCRIPTION_LOCK_OWNER=<owner>` to
`node scripts/run-subscription-news.mjs`. The runner rejects the primary
checkout, a different worktree, a different owner and a completed job. Each job
allows one real runner lease; duplicate processes and reruns of a completed or
failed attempt are rejected. Finish a failed attempt, then start a new isolated
job rather than rerunning its workspace. The lock
continues through artwork, final gates, heartbeat, authorized push and deployment
verification. A concurrent start must stop when lock acquisition fails.

The coordinator never deletes an old job workspace. A failed generation remains
there with its exact diagnostic changes, while the next successful `start`
creates a clean workspace from the then-current verified production commit.
`node scripts/subscription-job.mjs status` lists the ten newest records without
revealing lock owners.

After the runner process and all children have stopped, always close the job from
the coordinator checkout with exactly one terminal status:

```sh
node scripts/subscription-job.mjs finish --id <job-id> --status <failed|no_change|published> [--reason <bounded-reason>]
```

Pass `CC_SUBSCRIPTION_LOCK_OWNER=<owner>` privately to `finish`. Use `failed`
for any generation, source review, artwork, gate, push or deployment failure;
dirty output is preserved. Use `no_change` only when the job workspace is clean
and still at its base commit. Use `published` only after the workspace is clean,
its new commit is on `origin/main`, and the corresponding Vercel deployment is
`READY` at that exact full SHA. `finish` writes `finished_at`, records the
published commit when applicable, and releases the owner-matched operation lock.
Do not call `subscription-operation-lock.mjs release` during a normal job, and
do not use an `EXIT` trap. If a runner PID is still alive, `finish` deliberately
refuses to release the lock. If the job record becomes terminal but lock release
fails, retry the identical `finish` command with the same owner and status. The
retry completes the prior release without changing the result or releasing a
newer job's lock.

If the existing Mac task has no refresh step, it needs a one-time update on that Mac (or through a connected Mac host) to follow this document. Use Codex's automation tool to update the existing task, preserving its schedule and previously authorized publication scope; do not create a duplicate Windows schedule. No API key or credential export is needed.
If that checkout does not yet contain the lock script, first verify that no other
writer is active and perform the one-time clean fast-forward that installs this
reviewed change. Do not generate during that bootstrap refresh. Every subsequent
scheduled run uses `subscription-job.mjs start` before generation.
Retire or reconcile any separate image-only or legacy text schedule so exactly
one job can acquire this lock and own the full operation.

## Each new column

1. Create the column through the existing editorial and quality gates in the
   job workspace returned by `subscription-job.mjs start`.
2. Run `node scripts/prepare-codex-images.mjs --id <column-id> --limit 1`.
3. For `generate`, use the native image tool to create a fresh illustration for that column's headline, thesis and angle. Use a distinct scene/composition. Do not recycle the source news illustration, shared library, old crop or renamed file.
4. Visually inspect the actual result and import it with the queued fingerprint. Re-run the same ID queue command; successful completion has no job, no blocked entry and `pendingCount: 0`. An empty `jobs` array alone does not mean completion. A failure stays pending and must not be reported as completed artwork.
5. Keep the column JSON, manifest and generated source/variants in the same change. Publish only within the existing task's authorization. Preserve concurrent news updates; do not overwrite a refreshed collection with an old snapshot.

## Coverage mix

The Current covers AI companies and model economics, data center/cloud operators
(capacity, leases, earnings and financing), compute hardware, power/cooling, and
policy. Policy is not the default subject. Intake ranks both existing relevance
lanes; this does not promote an AI-only source to an infrastructure wire article.
Among fully eligible column candidates within 15% of the strongest evidence score,
the selector favors the least-covered beat in the latest five columns from the last
30 days. A materially stronger story still wins. There is no topic quota and no
exception to source rights, extraction, fidelity, repetition or publication limits.

Read `authored.lastSelection.diagnostics.by_beat`, `selected_beat`,
`selection_reason` and `recent_coverage` to distinguish absent/blocked company
sources from selection imbalance. New columns store `coverage_beat`; historical
columns are classified without rewriting their content. Do not promise company
coverage merely because the prompt names companies: an authorized full source
and a qualified candidate must actually exist. Any new source permission needs
its own evidence-backed review, outside the routine image automation.

## Existing repeated images

The default queue reads authored columns as well as latest news, prioritizes columns, and detects shared source hashes across the entire manifest. Process bounded batches (default one, maximum five when requested) using the same native workflow. Repeated runs gradually replace shared column images while preserving an already unique image for the same column. `register_existing` is reserved for recovery of that column's own unshared source.

## Source-fidelity review

Numeric, extraction and repetition checks are not proof that every nonnumeric assertion is supported. Compare the headline, deck, thesis, prose and figures with the actual cited source before artwork completion. In particular, distinguish a proposal, consultation or rating from an enacted obligation, permit condition, contract requirement or deadline. Treat model-produced expert insight and prior drafts as analytical context, not independent evidence. Hold and report unsupported factual or legal assertions instead of accepting them because automated numeric checks pass. Review a source's full announcement when the stored extraction omits context needed for that distinction; record what additional evidence was consulted.

## Avoiding a stalled queue

The CLI now checks pending columns against their saved, hash-validated source artifacts, current source permissions, long-form extraction, verified claim ledger and the existing authored quality contract (including numeric claims and repetition). It returns `jobs`, `pendingCount`, `readyCount`, and `blocked` with per-column reasons. Blocked columns remain pending with their current artwork unchanged; they do not consume the generation limit or stop another ready column. Missing or unauthorized source evidence requires editorial/source repair, not a new image or a weaker gate. These deterministic checks supplement the operator's factual review; they do not prove every assertion in an essay. Do not use lexical coverage of every source sentence as a pass/fail classifier for an original analyst argument; review its factual assertions against the cited evidence and distinguish the author's conditional analysis from reported facts.

If a returned job subsequently fails a column-specific review, continue the same run with `--exclude-id <id>` (repeat for additional IDs), recording its reason. Exclusion lasts only for that invocation and never marks an image complete. Stop on environment-wide failures such as unavailable native generation or missing returned file paths. Do not loop indefinitely: inspect each pending ID at most once per run and generate at most the authorized batch size.

Inspect `scripts/state/pipeline-state.json`'s `authored.lastSelection` diagnostics and `authored.lastFailure`, plus recent Mac automation logs. `no_qualifying_story` is an editorial outcome, not a crash. A new multi-day stall or newly blocked source is actionable; unchanged known holds are quiet. Do not force a column, change source permissions, add paid APIs, or lower quality thresholds to meet a quota. The text stage now accepts a named public policy actor when `named_companies` is the only missing expert field, while retaining relevance, source rights, extraction and all final essay gates.

The importer rejects exact reused source files and their normalized source bytes for another column. It also checks other articles' rendered hero, thumbnail, OpenGraph and legacy files, including byte-identical copies at different paths, and protects newly registered column sources from reuse by other articles. This is a file-identity guard, not a perceptual similarity detector: the native generation and visual-review steps must still ensure distinct compositions. Existing images remain visible until replacements are successfully imported; this change does not claim that a disconnected Mac has generated or deployed replacements.

## Subscription text generation

For the Astra/Fable migration, follow [subscription-generation.md](subscription-generation.md)
before creating new columns. Use `node scripts/run-subscription-news.mjs` in the
existing authorized Mac task, inside the active job workspace with its job ID
and lock owner; then finish this native artwork workflow and rerun the gates
before publication. GitHub now validates artifacts rather than
scheduling text generation. Pulling this document does not itself reconfigure
the Mac automation. Preserve the existing task and reconcile its schedule once
on the Mac rather than adding another writer.
