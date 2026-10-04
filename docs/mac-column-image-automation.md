# Mac column artwork

The Mac's existing Codex task performs native image generation. Git stores the code, instructions and registered images; pulling Git does not install or update an app-local schedule. This repository change is picked up automatically only when that task refreshes its checkout and reads these instructions. A Windows session cannot confirm a disconnected Mac's schedule or its next run.

## Start of each authorized scheduled run

Use the existing repository checkout and existing schedule. Check `git status --porcelain` and `git branch --show-current` first. On a clean `main` checkout with no local-only commits, run `git fetch origin` and `git merge --ff-only origin/main`. If local changes, a different branch, divergence or another writer are present, preserve them and report the exact blocker; do not reset, stash, force-push or silently switch branches. Read the updated `AGENTS.md` and `.codex/skills/compute-current-images/SKILL.md` after refreshing. Verify live production as required there. An unmerged branch or pending production deployment is not proof of production alignment.

If the existing Mac task has no refresh step, it needs a one-time update on that Mac (or through a connected Mac host) to follow this document. Use Codex's automation tool to update the existing task, preserving its schedule and previously authorized publication scope; do not create a duplicate Windows schedule. No API key or credential export is needed.

## Each new column

1. Create the column through the existing editorial and quality gates.
2. Run `node scripts/prepare-codex-images.mjs --id <column-id> --limit 1`.
3. For `generate`, use the native image tool to create a fresh illustration for that column's headline, thesis and angle. Use a distinct scene/composition. Do not recycle the source news illustration, shared library, old crop or renamed file.
4. Visually inspect the actual result and import it with the queued fingerprint. Re-run the same ID queue command; successful completion has no job, no blocked entry and `pendingCount: 0`. An empty `jobs` array alone does not mean completion. A failure stays pending and must not be reported as completed artwork.
5. Keep the column JSON, manifest and generated source/variants in the same change. Publish only within the existing task's authorization. Preserve concurrent news updates; do not overwrite a refreshed collection with an old snapshot.

## Existing repeated images

The default queue reads authored columns as well as latest news, prioritizes columns, and detects shared source hashes across the entire manifest. Process bounded batches (default one, maximum five when requested) using the same native workflow. Repeated runs gradually replace shared column images while preserving an already unique image for the same column. `register_existing` is reserved for recovery of that column's own unshared source.

## Source-fidelity review

Numeric, extraction and repetition checks are not proof that every nonnumeric assertion is supported. Compare the headline, deck, thesis, prose and figures with the actual cited source before artwork completion. In particular, distinguish a proposal, consultation or rating from an enacted obligation, permit condition, contract requirement or deadline. Treat model-produced expert insight and prior drafts as analytical context, not independent evidence. Hold and report unsupported factual or legal assertions instead of accepting them because automated numeric checks pass. Review a source's full announcement when the stored extraction omits context needed for that distinction; record what additional evidence was consulted.

## Avoiding a stalled queue

The CLI now checks pending columns against their saved, hash-validated source artifacts, current source permissions, long-form extraction, verified claim ledger and the existing authored quality contract (including numeric claims and repetition). It returns `jobs`, `pendingCount`, `readyCount`, and `blocked` with per-column reasons. Blocked columns remain pending with their current artwork unchanged; they do not consume the generation limit or stop another ready column. Missing or unauthorized source evidence requires editorial/source repair, not a new image or a weaker gate. These deterministic checks supplement the operator's factual review; they do not prove every assertion in an essay. Do not use lexical coverage of every source sentence as a pass/fail classifier for an original analyst argument; review its factual assertions against the cited evidence and distinguish the author's conditional analysis from reported facts.

If a returned job subsequently fails a column-specific review, continue the same run with `--exclude-id <id>` (repeat for additional IDs), recording its reason. Exclusion lasts only for that invocation and never marks an image complete. Stop on environment-wide failures such as unavailable native generation or missing returned file paths. Do not loop indefinitely: inspect each pending ID at most once per run and generate at most the authorized batch size.

Inspect `scripts/state/pipeline-state.json`'s `authored.lastSelection` diagnostics and `authored.lastFailure`, plus recent Update News logs. `no_qualifying_story` is an editorial outcome, not a crash. A new multi-day stall or newly blocked source is actionable; unchanged known holds are quiet. Do not force a column, change source permissions, add paid APIs, or lower quality thresholds to meet a quota. The text stage now accepts a named public policy actor when `named_companies` is the only missing expert field, while retaining relevance, source rights, extraction and all final essay gates.

The importer rejects exact reused source files and their normalized source bytes for another column. It also checks other articles' rendered hero, thumbnail, OpenGraph and legacy files, including byte-identical copies at different paths, and protects newly registered column sources from reuse by other articles. This is a file-identity guard, not a perceptual similarity detector: the native generation and visual-review steps must still ensure distinct compositions. Existing images remain visible until replacements are successfully imported; this change does not claim that a disconnected Mac has generated or deployed replacements.
