# Mac column artwork

The Mac's existing Codex task performs native image generation. Git stores the code, instructions and registered images; pulling Git does not install or update an app-local schedule. This repository change is picked up automatically only when that task refreshes its checkout and reads these instructions. A Windows session cannot confirm a disconnected Mac's schedule or its next run.

## Start of each authorized scheduled run

Use the existing repository checkout and existing schedule. Check `git status --porcelain` and `git branch --show-current` first. On a clean `main` checkout with no local-only commits, run `git fetch origin` and `git merge --ff-only origin/main`. If local changes, a different branch, divergence or another writer are present, preserve them and report the exact blocker; do not reset, stash, force-push or silently switch branches. Read the updated `AGENTS.md` and `.codex/skills/compute-current-images/SKILL.md` after refreshing. Verify live production as required there. An unmerged branch or pending production deployment is not proof of production alignment.

If the existing Mac task has no refresh step, it needs a one-time update on that Mac (or through a connected Mac host) to follow this document. Use Codex's automation tool to update the existing task, preserving its schedule and previously authorized publication scope; do not create a duplicate Windows schedule. No API key or credential export is needed.

## Each new column

1. Create the column through the existing editorial and quality gates.
2. Run `node scripts/prepare-codex-images.mjs --id <column-id> --limit 1`.
3. For `generate`, use the native image tool to create a fresh illustration for that column's headline, thesis and angle. Use a distinct scene/composition. Do not recycle the source news illustration, shared library, old crop or renamed file.
4. Visually inspect the actual result and import it with the queued fingerprint. Re-run the same queue command; successful completion returns `{"jobs":[]}`. A failure stays pending and must not be reported as completed artwork.
5. Keep the column JSON, manifest and generated source/variants in the same change. Publish only within the existing task's authorization. Preserve concurrent news updates; do not overwrite a refreshed collection with an old snapshot.

## Existing repeated images

The default queue reads authored columns as well as latest news, prioritizes columns, and detects shared source hashes across the entire manifest. Process bounded batches (default one, maximum five when requested) using the same native workflow. Repeated runs gradually replace shared column images while preserving an already unique image for the same column. `register_existing` is reserved for recovery of that column's own unshared source.

The importer rejects exact reused source files and their normalized source bytes for another column. It also protects newly registered column sources from reuse by other articles. This is a file-identity guard, not a perceptual similarity detector: the native generation and visual-review steps must still ensure distinct compositions. Existing images remain visible until replacements are successfully imported; this change does not claim that a disconnected Mac has generated or deployed replacements.
