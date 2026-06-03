# Recovery Point 1 Merge Deploy Plan

## TL;DR
> Summary:      Verify the already-created source preservation commit `16262026` and merge commit `3cb84d3b`, clean local agent artifacts out of the restore-point tree, run local and production verification, deploy to Vercel, then push the branch and annotated tag `recovery-point-1` with message `복구지점1`.
> Deliverables:
> - Verified post-merge branch `codex/review-cleanup-public-gates` based on `origin/main` commit `4039e5dd88ef418ecf84b17788d1857a992618ac`
> - Clean restore-point commit tree without tracked `.omo/` or `evidence/` runtime artifacts
> - Vercel production deploy URL plus inspect logs
> - Local and production homepage image HTTP audit evidence
> - Annotated Git tag `recovery-point-1` with message `복구지점1`, pushed with the branch
> Effort:       Medium
> Risk:         High - production deploy and branch/tag push are external side effects, and the branch is currently far ahead of its remote

## Scope
### Must have
- Verify the current branch state before changing anything: current exploration found `HEAD=3cb84d3be07115b06efcd2329987aff3bfc9d104`, `origin/main=4039e5dd88ef418ecf84b17788d1857a992618ac`, and `origin/codex/review-cleanup-public-gates=35239ea7bad181c938db591a24784a5d08a339b8`.
- Treat `16262026` as the source-preservation commit and `3cb84d3b` as the candidate merge-resolution commit; do not re-run merge/rebase unless the first state gate proves those commits are absent.
- Preserve the image precedence now encoded in `scripts/lib/article-image-surface.mjs`: canonical WebP/generated local images first, local placeholders/fallback SVGs ahead of unvalidated remote source images, remote source only when no generated/local candidate exists, category fallback last, and `gemini`/`legacy-gemini` included as AI provider tokens.
- Remove tracked local agent runtime files from the final restore-point tree and prevent future accidental commits of `.omo/` and `evidence/`.
- Run targeted tests, Astro check, image audit, build, local homepage image HTTP QA, Vercel deploy/inspect, production homepage image HTTP QA, and production surface verification.
- Create restore metadata and push the branch plus annotated tag `recovery-point-1`.

### Must NOT have (guardrails, anti-slop, scope boundaries)
- Do not run `git add .`; every staged path must be explicit.
- Do not use `git reset --hard`, `git checkout -- .`, `git clean`, rebase, or force-push in this execution lane.
- Do not re-run the merge if `HEAD` is already a merge commit whose second parent is `4039e5dd88ef418ecf84b17788d1857a992618ac`.
- Do not commit `.omo/`, `evidence/`, `dist/`, `.astro/`, logs, `.env`, `.vercel/`, or secret-bearing files.
- Do not regenerate article content, rotate secrets, alter Vercel project settings, purge caches, or change admin functionality unless a listed verification command naturally updates generated data and the diff is reviewed.
- Do not weaken extraction QA, repetition checks, source-fidelity checks, or product-fit boundaries from `AGENTS.md` and `scripts/lib/AGENTS.override.md`.
- Do not tag or push if any local verification, Vercel inspect, production HTTP audit, or final review fails.

## Verification strategy
> Zero human intervention - all verification is agent-executed.
- Test decision: tests-after + Node `node:test`, Astro check, existing audit scripts, Vercel CLI verification
- QA policy: every task has agent-executed scenarios
- Evidence: `evidence/task-<N>-<slug>.<ext>`

## Execution strategy
### Parallel execution waves
> Target 5-8 tasks per wave. <3 per wave (except final) = under-splitting.
> Extract shared dependencies as Wave-1 tasks to maximize parallelism.

Wave 1 (no dependencies):
- Task 1: Capture state gate and restore snapshot

Wave 2 (after Wave 1):
- Task 2: depends [1] - remove tracked local agent artifacts and commit ignore/plan cleanup
- Task 3: depends [1] - audit merge ancestry and conflict resolution
- Task 4: depends [1] - prove image precedence with red/green targeted regression

Wave 3 (after Wave 2):
- Task 5: depends [2, 3, 4] - run Astro check and image audit
- Task 6: depends [2, 3, 4] - run targeted Node tests
- Task 9: depends [2, 3, 4] - verify Vercel CLI/auth/project preflight

Wave 4 (after Wave 3):
- Task 7: depends [5, 6] - build and commit legitimate build/report side effects
- Task 8: depends [7] - run local homepage image HTTP QA

Wave 5 (after Wave 4):
- Task 10: depends [7, 8, 9] - deploy to Vercel production and inspect
- Task 11: depends [10] - verify production surface and commit restore metadata
- Task 12: depends [11] - push branch and annotated restore tag

Critical path: Task 1 -> Task 2 -> Task 4 -> Task 6 -> Task 7 -> Task 8 -> Task 10 -> Task 11 -> Task 12

### Dependency matrix
| Task | Depends on | Blocks | Can parallelize with |
|------|------------|--------|----------------------|
| 1    | none       | 2, 3, 4, 9 | none |
| 2    | 1          | 5, 6, 7 | 3, 4, 9 |
| 3    | 1          | 5, 6, 7 | 2, 4, 9 |
| 4    | 1          | 5, 6, 7 | 2, 3, 9 |
| 5    | 2, 3, 4   | 7      | 6, 9 |
| 6    | 2, 3, 4   | 7      | 5, 9 |
| 7    | 5, 6      | 8, 10  | 9 |
| 8    | 7          | 10     | none |
| 9    | 2, 3, 4   | 10     | 5, 6, 7 |
| 10   | 7, 8, 9   | 11     | none |
| 11   | 10         | 12     | none |
| 12   | 11         | final  | none |

## Todos
> Implementation + Test = ONE task. Never separate.
> Every task MUST have: References + Acceptance Criteria + QA Scenarios + Commit.

- [ ] 1. Capture state gate and restore snapshot

  What to do: Capture the current repo state before any execution. Verify whether the merge is already complete. Based on current exploration, `HEAD` should be `3cb84d3b`, `HEAD^2` should be `4039e5dd`, there should be no `.git/MERGE_HEAD`, and the only tracked dirty path should be `docs/blog-surface-v4-audit-report.md`. Write evidence under `evidence/` and stop if the state differs in a way that would make this plan unsafe.
  Must NOT do: Do not stage, commit, deploy, tag, push, abort a merge, or run any destructive Git command.

  Parallelization: Can parallel: NO | Wave 1 | Blocks: [2, 3, 4, 9] | Blocked by: []

  References (executor has NO interview context - be exhaustive):
  - Pattern:  `package.json:17` - `npm run build` runs dashboard sync and static image preparation, so later build side effects must be reviewed.
  - Pattern:  `.gitignore:1` - current ignore file excludes build/tool output and env files but does not yet exclude `.omo/` or `evidence/`.
  - Pattern:  `.vercelignore:1` - deployment already excludes `.omo/`, `evidence/`, `plans/`, build output, and logs.
  - Pattern:  `AGENTS.md:5` - product boundary is AI infrastructure intelligence, not generic AI news.
  - Pattern:  `AGENTS.md:30` - `scripts/lib/` changes must also follow the local editorial override.
  - External: `https://git-scm.com/docs/git-merge` - official Git merge docs for conflict/merge state behavior.

  Acceptance criteria (agent-executable only):
  - [ ] `git rev-parse --abbrev-ref HEAD` prints `codex/review-cleanup-public-gates`.
  - [ ] `git rev-parse HEAD^2` prints `4039e5dd88ef418ecf84b17788d1857a992618ac`; if this command fails, `HEAD` is not the expected merge commit and execution stops.
  - [ ] `test ! -f .git/MERGE_HEAD` exits `0`.
  - [ ] `git status --porcelain=v1` output is captured to `evidence/task-1-state-status.txt`.
  - [ ] `git log --oneline --decorate -12` output is captured to `evidence/task-1-state-log.txt`.
  - [ ] `rg -n '<<<<<<<|=======|>>>>>>>' public scripts src tests docs` exits `1` and output is captured to `evidence/task-1-conflict-marker-scan.txt`.

  QA scenarios (MANDATORY - task incomplete without these):
  > Name the exact tool AND its exact invocation - not "verify it works". Browser use: use Chrome to drive the page; if Chrome is not available, download and use agent-browser (https://github.com/vercel-labs/agent-browser). Computer use: OS-level GUI automation for a non-browser desktop app.
  ```
  Scenario: expected post-merge state
    Tool:     bash
    Steps:    mkdir -p evidence && git rev-parse HEAD > evidence/task-1-head.txt && git rev-parse HEAD^2 > evidence/task-1-second-parent.txt && git status --porcelain=v1 > evidence/task-1-state-status.txt && git log --oneline --decorate -12 > evidence/task-1-state-log.txt && rg -n '<<<<<<<|=======|>>>>>>>' public scripts src tests docs > evidence/task-1-conflict-marker-scan.txt; test $? -eq 1
    Expected: evidence/task-1-second-parent.txt contains 4039e5dd88ef418ecf84b17788d1857a992618ac; conflict-marker scan has no matches.
    Evidence: evidence/task-1-state-status.txt

  Scenario: unsafe active merge state
    Tool:     bash
    Steps:    if test -f .git/MERGE_HEAD; then cat .git/MERGE_HEAD > evidence/task-1-active-merge-error.txt; exit 1; else printf 'no active merge\n' > evidence/task-1-active-merge-error.txt; fi
    Expected: evidence says no active merge; command exits 0.
    Evidence: evidence/task-1-active-merge-error.txt
  ```

  Commit: NO | Message: `n/a` | Files: []

- [ ] 2. Remove tracked local agent artifacts and commit ignore/plan cleanup

  What to do: Remove tracked `.omo/` runtime files from the restore-point tree, add `.omo/` and `evidence/` to `.gitignore` if missing, include this plan file, and either commit the existing timestamp-only `docs/blog-surface-v4-audit-report.md` diff or remove that diff from the index by regenerating it through the later verification task. Current exploration found tracked `.omo/boulder.json` and `.omo/start-work/ledger.jsonl`; the final restore-point tree must not contain them.
  Must NOT do: Do not remove the local `.omo/` directory from disk; use index removal only. Do not commit `evidence/`, `.omo/drafts/`, `.omo/ulw-loop/`, logs, env files, or broad untracked output.

  Parallelization: Can parallel: YES | Wave 2 | Blocks: [5, 6, 7] | Blocked by: [1]

  References (executor has NO interview context - be exhaustive):
  - Pattern:  `.gitignore:1` - add local runtime artifact ignore patterns here.
  - Pattern:  `.vercelignore:1` - deployment already excludes `.omo/` and `evidence/`; Git ignore should match the restore-point intent.
  - Pattern:  `docs/blog-surface-v4-audit-report.md:1` - current tracked dirty diff is a generated timestamp in this report.
  - Pattern:  `plans/recovery-point-1-merge-deploy.md:1` - this plan is the execution contract and should be committed before tagging.

  Acceptance criteria (agent-executable only):
  - [ ] `git ls-files .omo evidence` prints nothing after the cleanup commit.
  - [ ] `git check-ignore .omo/boulder.json evidence/probe.json` exits `0`.
  - [ ] `git show --name-only --format= HEAD | rg '^\.omo/|^evidence/'` exits `1`.
  - [ ] `git status --short` has no tracked dirty files except those intentionally produced by later verification tasks.

  QA scenarios (MANDATORY - task incomplete without these):
  ```
  Scenario: artifact cleanup happy path
    Tool:     bash
    Steps:    tracked_omo="$(git ls-files .omo)"; if test -n "$tracked_omo"; then git rm --cached $tracked_omo; fi; if ! rg -q '^\.omo/$' .gitignore; then printf '\n# Local agent/runtime artifacts\n.omo/\nevidence/\n' >> .gitignore; fi; git add .gitignore docs/blog-surface-v4-audit-report.md plans/recovery-point-1-merge-deploy.md; git commit -m "chore(recovery): exclude local agent artifacts" -m "The restore point should carry source, generated public assets, verification docs, and the execution plan, not local runtime state from agent workflows.\n\nConstraint: .vercelignore already keeps local runtime artifacts out of deployment\nRejected: git add . | risks committing transient evidence and .omo runtime files\nConfidence: high\nScope-risk: narrow\nTested: git ls-files .omo evidence; git check-ignore .omo/boulder.json evidence/probe.json\nNot-tested: remote branch protection before push"
    Expected: commit succeeds; `.omo/` and `evidence/` are ignored and untracked.
    Evidence: evidence/task-2-artifact-cleanup.txt

  Scenario: accidental artifact tracking guard
    Tool:     bash
    Steps:    git ls-files .omo evidence > evidence/task-2-tracked-artifacts-error.txt; test ! -s evidence/task-2-tracked-artifacts-error.txt
    Expected: evidence file is empty and command exits 0.
    Evidence: evidence/task-2-tracked-artifacts-error.txt
  ```

  Commit: YES | Message: `chore(recovery): exclude local agent artifacts` | Files: [.gitignore, docs/blog-surface-v4-audit-report.md, plans/recovery-point-1-merge-deploy.md, .omo/boulder.json, .omo/start-work/ledger.jsonl]

- [ ] 3. Audit merge ancestry and conflict resolution

  What to do: Prove that current `HEAD` is a merge of the source-preservation commit and `origin/main`, and that conflict files no longer contain conflict markers. Compare the merge parents and current file contents for the known conflict set: `public/dashboard-data.json`, `scripts/lib/article-image-surface.mjs`, `src/data/search-index.json`, and `tests/article-image-source-fallback.test.mjs`.
  Must NOT do: Do not re-run `git merge origin/main`, `git rebase origin/main`, or `git merge --continue` when `HEAD^2` already equals `4039e5dd88ef418ecf84b17788d1857a992618ac`.

  Parallelization: Can parallel: YES | Wave 2 | Blocks: [5, 6, 7] | Blocked by: [1]

  References (executor has NO interview context - be exhaustive):
  - Pattern:  `scripts/lib/article-image-surface.mjs:60` - merged provider regex includes `gemini` and `legacy-gemini` tokens from upstream.
  - Pattern:  `scripts/lib/article-image-surface.mjs:118` - branch-specific canonical article Image2/WebP variant path selection is preserved.
  - Pattern:  `scripts/lib/article-image-surface.mjs:176` - current image variant resolver owns the precedence between generated, source, and fallback images.
  - Pattern:  `tests/article-image-source-fallback.test.mjs:27` - local placeholder must beat unvalidated source artwork.
  - Pattern:  `tests/article-image-source-fallback.test.mjs:64` - canonical article variants must beat source artwork.
  - Test:     `tests/public-image-display.test.mjs:40` - public feed must avoid affected remote HPCWire source artwork when local generated cards exist.
  - External: `https://git-scm.com/docs/git-merge` - official merge parent/conflict semantics.

  Acceptance criteria (agent-executable only):
  - [ ] `git rev-parse HEAD^1` prints the source-preservation side and `git rev-parse HEAD^2` prints `4039e5dd88ef418ecf84b17788d1857a992618ac`.
  - [ ] `git diff --name-only HEAD^1 HEAD -- scripts/lib/article-image-surface.mjs tests/article-image-source-fallback.test.mjs public/dashboard-data.json src/data/search-index.json` lists only expected conflict-resolution files in that set.
  - [ ] `rg -n '<<<<<<<|=======|>>>>>>>' public/dashboard-data.json scripts/lib/article-image-surface.mjs src/data/search-index.json tests/article-image-source-fallback.test.mjs` exits `1`.
  - [ ] `git show --format=%B -s HEAD` includes a lore-style merge rationale with `Constraint:`, `Rejected:`, `Confidence:`, `Scope-risk:`, `Directive:`, `Tested:`, and `Not-tested:`.

  QA scenarios (MANDATORY - task incomplete without these):
  ```
  Scenario: merge ancestry and conflict files are clean
    Tool:     bash
    Steps:    git rev-parse HEAD^1 > evidence/task-3-first-parent.txt && git rev-parse HEAD^2 > evidence/task-3-second-parent.txt && git diff --name-only HEAD^1 HEAD -- public/dashboard-data.json scripts/lib/article-image-surface.mjs src/data/search-index.json tests/article-image-source-fallback.test.mjs > evidence/task-3-conflict-resolution-files.txt && rg -n '<<<<<<<|=======|>>>>>>>' public/dashboard-data.json scripts/lib/article-image-surface.mjs src/data/search-index.json tests/article-image-source-fallback.test.mjs > evidence/task-3-conflict-markers.txt; test $? -eq 1
    Expected: second parent is 4039e5dd88ef418ecf84b17788d1857a992618ac and no conflict markers exist.
    Evidence: evidence/task-3-conflict-resolution-files.txt

  Scenario: wrong merge parent fails release gate
    Tool:     bash
    Steps:    test "$(git rev-parse HEAD^2)" = "4039e5dd88ef418ecf84b17788d1857a992618ac" || { git rev-parse HEAD^2 > evidence/task-3-wrong-parent-error.txt; exit 1; }
    Expected: command exits 0; if it exits 1, evidence contains the unexpected second parent and execution stops.
    Evidence: evidence/task-3-wrong-parent-error.txt
  ```

  Commit: NO | Message: `n/a` | Files: []

- [ ] 4. Prove image precedence with red/green targeted regression

  What to do: Preserve the merged image-routing policy by proving the current tests pass on the merged branch and fail against a disposable `origin/main` worktree. This satisfies the red/green requirement without editing production code when the tests already exist.
  Must NOT do: Do not leave the disposable worktree behind. Do not alter `origin/main`, the current branch, generated assets, or source code during the red proof.

  Parallelization: Can parallel: YES | Wave 2 | Blocks: [5, 6, 7] | Blocked by: [1]

  References (executor has NO interview context - be exhaustive):
  - Pattern:  `scripts/lib/article-image-surface.mjs:118` - canonical WebP variant path must be in generated candidate ordering.
  - Pattern:  `scripts/lib/article-image-surface.mjs:162` - explicit fallback SVGs are placeholders even when provider metadata looks AI.
  - Pattern:  `scripts/lib/article-image-surface.mjs:205` - remote source candidates are used only after generated/local candidates fail.
  - Pattern:  `scripts/lib/article-image-surface.mjs:277` - unvalidated remote images are not trusted public images.
  - Test:     `tests/article-image-source-fallback.test.mjs:10` - remote source-only case.
  - Test:     `tests/article-image-source-fallback.test.mjs:27` - local placeholder over unvalidated source case.
  - Test:     `tests/article-image-source-fallback.test.mjs:48` - Image2 metadata ahead of source.
  - Test:     `tests/article-image-source-fallback.test.mjs:64` - canonical WebP variants ahead of source.
  - Test:     `tests/article-image-source-fallback.test.mjs:85` - explicit fallback SVG placeholder case.

  Acceptance criteria (agent-executable only):
  - [ ] Current branch passes `node --test tests/article-image-source-fallback.test.mjs tests/public-image-display.test.mjs tests/image-output.test.mjs`.
  - [ ] Disposable `origin/main` worktree fails when running current `tests/article-image-source-fallback.test.mjs`, proving the local placeholder/canonical regressions are meaningful.
  - [ ] Red worktree is removed before the task ends.

  QA scenarios (MANDATORY - task incomplete without these):
  ```
  Scenario: green image precedence tests on current branch
    Tool:     bash
    Steps:    node --test tests/article-image-source-fallback.test.mjs tests/public-image-display.test.mjs tests/image-output.test.mjs > evidence/task-4-image-green.txt 2>&1
    Expected: command exits 0 and evidence includes passing test output.
    Evidence: evidence/task-4-image-green.txt

  Scenario: red proof against origin/main
    Tool:     bash
    Steps:    rm -rf ../recovery-point-1-red-origin-main && git worktree add ../recovery-point-1-red-origin-main origin/main > evidence/task-4-red-worktree-add.txt 2>&1 && cp tests/article-image-source-fallback.test.mjs ../recovery-point-1-red-origin-main/tests/article-image-source-fallback.test.mjs && (cd ../recovery-point-1-red-origin-main && node --test tests/article-image-source-fallback.test.mjs > "../New project 2/evidence/task-4-image-red.txt" 2>&1); status=$?; git worktree remove ../recovery-point-1-red-origin-main --force > evidence/task-4-red-worktree-remove.txt 2>&1; test "$status" -ne 0
    Expected: command exits 0 because the copied regression test fails on origin/main; worktree removal evidence exists.
    Evidence: evidence/task-4-image-red.txt
  ```

  Commit: NO | Message: `n/a` | Files: []

- [ ] 5. Run Astro check and image audit

  What to do: Run the required static checks that do not need a dev server. Capture full output. If these commands modify generated docs/data, do not commit in this task; leave the diff for Task 7's build side-effect review.
  Must NOT do: Do not deploy, tag, push, or commit partial verification output.

  Parallelization: Can parallel: YES | Wave 3 | Blocks: [7] | Blocked by: [2, 3, 4]

  References (executor has NO interview context - be exhaustive):
  - Pattern:  `package.json:18` - `npm run check` is the Astro check command.
  - Pattern:  `package.json:52` - `npm run audit:images` maps to `node scripts/audit-public-images.mjs`.
  - Pattern:  `scripts/lib/AGENTS.override.md:12` - repetition/source-fidelity style gates must be run before marking generated article copy publishable.
  - Pattern:  `AGENTS.md:22` - always run repetition and source-fidelity evals before publishing.

  Acceptance criteria (agent-executable only):
  - [ ] `npm run check` exits `0`.
  - [ ] `npm run audit:images` exits `0`.
  - [ ] Output files exist at `evidence/task-5-npm-check.txt` and `evidence/task-5-audit-images.txt`.

  QA scenarios (MANDATORY - task incomplete without these):
  ```
  Scenario: static checks pass
    Tool:     bash
    Steps:    npm run check > evidence/task-5-npm-check.txt 2>&1 && npm run audit:images > evidence/task-5-audit-images.txt 2>&1
    Expected: both commands exit 0.
    Evidence: evidence/task-5-npm-check.txt

  Scenario: audit output is present and nonempty
    Tool:     bash
    Steps:    test -s evidence/task-5-npm-check.txt && test -s evidence/task-5-audit-images.txt
    Expected: command exits 0; both evidence files are nonempty.
    Evidence: evidence/task-5-audit-images.txt
  ```

  Commit: NO | Message: `n/a` | Files: []

- [ ] 6. Run targeted Node tests

  What to do: Run the assignment-required targeted test set, including the homepage HTTP audit unit tests and image-output tests. Capture output and stop if any test fails.
  Must NOT do: Do not run broad content regeneration, deployment, push, or tag commands in this task.

  Parallelization: Can parallel: YES | Wave 3 | Blocks: [7] | Blocked by: [2, 3, 4]

  References (executor has NO interview context - be exhaustive):
  - Test: `tests/article-image-source-fallback.test.mjs:10` - source-only image fallback behavior.
  - Test: `tests/public-image-display.test.mjs:28` - public feed cards must carry displayable editorial images.
  - Test: `tests/homepage-image-http-audit.test.mjs:51` - homepage image HTTP audit passes reachable images.
  - Test: `tests/homepage-image-http-audit.test.mjs:117` - homepage image HTTP audit fails blocked/forbidden images.
  - Test: `tests/image-output.test.mjs:17` - fallback assets cover every public taxonomy lane.

  Acceptance criteria (agent-executable only):
  - [ ] `node --test tests/article-image-source-fallback.test.mjs tests/public-image-display.test.mjs tests/homepage-image-http-audit.test.mjs tests/image-output.test.mjs` exits `0`.
  - [ ] Evidence exists at `evidence/task-6-targeted-tests.txt`.
  - [ ] The test output includes the source fallback, public image display, homepage HTTP audit, and image output suites.

  QA scenarios (MANDATORY - task incomplete without these):
  ```
  Scenario: targeted tests pass
    Tool:     bash
    Steps:    node --test tests/article-image-source-fallback.test.mjs tests/public-image-display.test.mjs tests/homepage-image-http-audit.test.mjs tests/image-output.test.mjs > evidence/task-6-targeted-tests.txt 2>&1
    Expected: command exits 0.
    Evidence: evidence/task-6-targeted-tests.txt

  Scenario: homepage HTTP audit failure tests are included
    Tool:     bash
    Steps:    rg -n "fails blocked or forbidden images|fails 200 image URLs served as non-image content" tests/homepage-image-http-audit.test.mjs > evidence/task-6-homepage-http-edge-coverage.txt
    Expected: command exits 0 and evidence lists both failure-case tests.
    Evidence: evidence/task-6-homepage-http-edge-coverage.txt
  ```

  Commit: NO | Message: `n/a` | Files: []

- [ ] 7. Build and commit legitimate build/report side effects

  What to do: Run `npm run build`, then review `git status --short` and `git diff --stat`. Commit only legitimate tracked build/report side effects required for the restore point. If unexpected source changes appear, stop and record them in evidence rather than committing blindly.
  Must NOT do: Do not commit `.omo/`, `evidence/`, `dist/`, `.astro/`, logs, env files, or Vercel local state. Do not tag before this task is complete.

  Parallelization: Can parallel: YES | Wave 4 | Blocks: [8, 10] | Blocked by: [5, 6]

  References (executor has NO interview context - be exhaustive):
  - Pattern:  `package.json:17` - build command runs `sync:dashboard-data`, `prepare:static-images`, and `astro build`.
  - Pattern:  `vercel.json:1` - Vercel deploy uses Astro framework, `npm run build`, and `dist` output.
  - Pattern:  `.gitignore:4` - `dist/` and `.astro/` are build/tool output and must not be committed.
  - Pattern:  `docs/deployment-checklist.md:5` - live freshness cannot be claimed without deployment evidence and live URL checks.

  Acceptance criteria (agent-executable only):
  - [ ] `npm run build` exits `0`.
  - [ ] `git status --short` after build is captured to `evidence/task-7-post-build-status.txt`.
  - [ ] If tracked source/data/report files changed, they are committed with a lore-style commit; otherwise `git diff --quiet` exits `0`.
  - [ ] `git status --short --ignored=no` after any commit shows no tracked dirty files.

  QA scenarios (MANDATORY - task incomplete without these):
  ```
  Scenario: production build passes
    Tool:     bash
    Steps:    npm run build > evidence/task-7-build.txt 2>&1 && git status --short > evidence/task-7-post-build-status.txt && git diff --stat > evidence/task-7-post-build-diff-stat.txt
    Expected: build exits 0; evidence captures any side effects.
    Evidence: evidence/task-7-build.txt

  Scenario: unexpected build side effects are blocked
    Tool:     bash
    Steps:    if git status --short | rg '^\?\? (\.omo/|evidence/)|^\?\? dist/|^\?\? \.astro/|^.. \.env'; then git status --short > evidence/task-7-build-side-effect-error.txt; exit 1; else printf 'no forbidden build side effects\n' > evidence/task-7-build-side-effect-error.txt; fi
    Expected: command exits 0; forbidden artifact paths are absent.
    Evidence: evidence/task-7-build-side-effect-error.txt
  ```

  Commit: YES | Message: `chore(recovery): record restore-point build outputs` | Files: [package-managed generated data/report files shown by `git diff --name-only`; never `.omo/`, `evidence/`, `dist/`, `.astro/`, logs, env files]

- [ ] 8. Run local homepage image HTTP QA

  What to do: Start the built Astro preview server on a fixed high port, run the homepage image HTTP audit against it, capture the homepage HTML, then stop the server. This is the local manual QA substitute required before production deploy.
  Must NOT do: Do not leave the preview server running. Do not deploy if local audit fails.

  Parallelization: Can parallel: NO | Wave 4 | Blocks: [10] | Blocked by: [7]

  References (executor has NO interview context - be exhaustive):
  - Pattern:  `package.json:19` - `npm run preview` starts the Astro preview server after build.
  - Pattern:  `scripts/audit-homepage-images-http.mjs:11` - audit command requires `--base-url`.
  - Pattern:  `scripts/audit-homepage-images-http.mjs:163` - audit fails when `--base-url` is missing.
  - Pattern:  `scripts/audit-homepage-images-http.mjs:190` - required source checks and failed image checks determine the `ok` result.

  Acceptance criteria (agent-executable only):
  - [ ] `node scripts/audit-homepage-images-http.mjs --base-url http://127.0.0.1:43219 --out evidence/task-8-local-homepage-images.json --blocked-host hpcwire.com` exits `0`.
  - [ ] `evidence/task-8-local-homepage-images.json` has `"ok": true`.
  - [ ] Preview server PID from `evidence/task-8-preview.pid` no longer exists after cleanup.

  QA scenarios (MANDATORY - task incomplete without these):
  ```
  Scenario: local homepage image audit passes
    Tool:     bash
    Steps:    npm run preview -- --host 127.0.0.1 --port 43219 > evidence/task-8-preview.log 2>&1 & echo $! > evidence/task-8-preview.pid; sleep 5; curl -fsS http://127.0.0.1:43219/ > evidence/task-8-local-homepage.html; node scripts/audit-homepage-images-http.mjs --base-url http://127.0.0.1:43219 --out evidence/task-8-local-homepage-images.json --blocked-host hpcwire.com; kill "$(cat evidence/task-8-preview.pid)"; sleep 1; ! kill -0 "$(cat evidence/task-8-preview.pid)" 2>/dev/null
    Expected: curl and audit exit 0; JSON evidence has ok true; server is stopped.
    Evidence: evidence/task-8-local-homepage-images.json

  Scenario: audit fails cleanly for unreachable server
    Tool:     bash
    Steps:    node scripts/audit-homepage-images-http.mjs --base-url http://127.0.0.1:9 --out evidence/task-8-local-homepage-images-error.json; test $? -ne 0
    Expected: command exits 0 because the audit command fails as expected; error JSON has ok false.
    Evidence: evidence/task-8-local-homepage-images-error.json
  ```

  Commit: NO | Message: `n/a` | Files: []

- [ ] 9. Verify Vercel CLI/auth/project preflight

  What to do: Confirm Vercel CLI is installed, authenticated or usable with `VERCEL_TOKEN`, and the project is linked before deployment. Capture version, identity, and project-link evidence without exposing token values.
  Must NOT do: Do not print `VERCEL_TOKEN`, create a new Vercel project, change project settings, or deploy in this task.

  Parallelization: Can parallel: YES | Wave 3 | Blocks: [10] | Blocked by: [2, 3, 4]

  References (executor has NO interview context - be exhaustive):
  - Pattern:  `vercel.json:1` - deployment is configured as Astro with `npm run build` and `dist`.
  - Pattern:  `docs/deployment-checklist.md:57` - production verification requires live smoke checks and recorded evidence.
  - External: `https://vercel.com/docs/cli#global-options` - official Vercel CLI global `--token`, `--scope`, and `--yes` options.
  - External: `https://vercel.com/docs/cli/deploy` - official Vercel CLI deploy docs.
  - External: `https://vercel.com/docs/cli/inspect` - official Vercel CLI inspect docs.

  Acceptance criteria (agent-executable only):
  - [ ] `vercel --version` exits `0`.
  - [ ] Either `vercel whoami` exits `0`, or `test -n "$VERCEL_TOKEN"` exits `0`.
  - [ ] `test -f .vercel/project.json` exits `0`; if missing, stop and record the blocker.
  - [ ] Evidence files exist at `evidence/task-9-vercel-version.txt`, `evidence/task-9-vercel-whoami.txt`, and `evidence/task-9-vercel-project.txt`.

  QA scenarios (MANDATORY - task incomplete without these):
  ```
  Scenario: Vercel preflight passes
    Tool:     bash
    Steps:    vercel --version > evidence/task-9-vercel-version.txt 2>&1 && (vercel whoami > evidence/task-9-vercel-whoami.txt 2>&1 || test -n "${VERCEL_TOKEN:-}") && test -f .vercel/project.json && cp .vercel/project.json evidence/task-9-vercel-project.txt
    Expected: command exits 0; evidence captures version, auth path, and project-link file without token values.
    Evidence: evidence/task-9-vercel-version.txt

  Scenario: missing Vercel project link blocks deploy
    Tool:     bash
    Steps:    if test -f .vercel/project.json; then printf 'project link present\n' > evidence/task-9-vercel-project-error.txt; else printf 'missing .vercel/project.json\n' > evidence/task-9-vercel-project-error.txt; exit 1; fi
    Expected: command exits 0 only when project link exists.
    Evidence: evidence/task-9-vercel-project-error.txt
  ```

  Commit: NO | Message: `n/a` | Files: []

- [ ] 10. Deploy to Vercel production and inspect

  What to do: Deploy the verified branch to Vercel production, capture the deployment URL, and inspect that exact deployment with `--wait --logs`. Use `VERCEL_TOKEN` if present; otherwise rely on local authenticated Vercel CLI.
  Must NOT do: Do not deploy before Tasks 7, 8, and 9 pass. Do not paste token values into evidence. Do not promote a different deployment URL.

  Parallelization: Can parallel: NO | Wave 5 | Blocks: [11] | Blocked by: [7, 8, 9]

  References (executor has NO interview context - be exhaustive):
  - Pattern:  `vercel.json:3` - Vercel build command is `npm run build`.
  - Pattern:  `vercel.json:4` - Vercel output directory is `dist`.
  - External: `https://vercel.com/docs/cli/deploy` - `--prod` creates a production deployment and stdout is the deployment URL.
  - External: `https://vercel.com/docs/cli/inspect` - inspect accepts deployment URL/ID and supports `--wait --logs`.

  Acceptance criteria (agent-executable only):
  - [ ] `evidence/task-10-vercel-deploy-url.txt` contains one `https://` deployment URL.
  - [ ] `vercel inspect "$DEPLOY_URL" --wait --logs` exits `0`.
  - [ ] `evidence/task-10-vercel-inspect.txt` contains deployment status/target/build log evidence.

  QA scenarios (MANDATORY - task incomplete without these):
  ```
  Scenario: production deploy and inspect pass
    Tool:     bash
    Steps:    TOKEN_ARGS=(); if test -n "${VERCEL_TOKEN:-}"; then TOKEN_ARGS=(--token "$VERCEL_TOKEN"); fi; DEPLOY_URL="$(vercel deploy --prod --yes "${TOKEN_ARGS[@]}" 2> evidence/task-10-vercel-deploy.err | tee evidence/task-10-vercel-deploy-url.txt)"; test -n "$DEPLOY_URL"; vercel inspect "$DEPLOY_URL" --wait --logs "${TOKEN_ARGS[@]}" > evidence/task-10-vercel-inspect.txt 2>&1
    Expected: deploy and inspect exit 0; deploy URL evidence starts with https://.
    Evidence: evidence/task-10-vercel-inspect.txt

  Scenario: deploy URL validation blocks bad output
    Tool:     bash
    Steps:    rg -n '^https://.+vercel\.app|^https://.+' evidence/task-10-vercel-deploy-url.txt > evidence/task-10-vercel-url-validation.txt
    Expected: command exits 0 and records the deployment URL line.
    Evidence: evidence/task-10-vercel-url-validation.txt
  ```

  Commit: NO | Message: `n/a` | Files: []

- [ ] 11. Verify production surface and commit restore metadata

  What to do: Run production homepage image HTTP audit against the Vercel deployment URL and canonical live URL, run the production verification harness, write `docs/recovery-point-1.md` with the final commit, deploy URL, tag name, and evidence paths, then commit metadata/report changes.
  Must NOT do: Do not tag or push before this commit exists and production checks pass. Do not include secrets, tokens, or local evidence file contents in the metadata doc.

  Parallelization: Can parallel: NO | Wave 5 | Blocks: [12] | Blocked by: [10]

  References (executor has NO interview context - be exhaustive):
  - Pattern:  `scripts/audit-homepage-images-http.mjs:163` - homepage image HTTP audit requires `--base-url`.
  - Pattern:  `scripts/audit-homepage-images-http.mjs:193` - audit `ok` requires homepage success, no failed images, and no missing required sources.
  - Pattern:  `scripts/verify-production-surface.mjs:186` - production harness checks local dist, URLs, cache purge state, and screenshots.
  - Pattern:  `docs/deployment-checklist.md:63` - production verification requires live smoke checks for homepage, article page, RSS, sitemap, admin login, image rendering, and cache purge.

  Acceptance criteria (agent-executable only):
  - [ ] Production audit against `$(cat evidence/task-10-vercel-deploy-url.txt)` exits `0` and JSON has `"ok": true`.
  - [ ] Production audit against `https://www.computecurrent.com` exits `0` and JSON has `"ok": true`.
  - [ ] `node scripts/verify-production-surface.mjs --local-dist dist --live "$DEPLOY_URL" --out docs/production-verification-report.md --json evidence/task-11-production-surface.json` exits `0`.
  - [ ] `docs/recovery-point-1.md` records `recovery-point-1`, `복구지점1`, the final commit SHA, deployment URL, branch name, and evidence paths.
  - [ ] Metadata commit uses a Conventional Commit subject and Lore trailers.

  QA scenarios (MANDATORY - task incomplete without these):
  ```
  Scenario: production homepage and surface verification pass
    Tool:     bash
    Steps:    DEPLOY_URL="$(cat evidence/task-10-vercel-deploy-url.txt)"; node scripts/audit-homepage-images-http.mjs --base-url "$DEPLOY_URL" --out evidence/task-11-production-homepage-images.json --blocked-host hpcwire.com && node scripts/audit-homepage-images-http.mjs --base-url https://www.computecurrent.com --out evidence/task-11-production-homepage-images-canonical.json --blocked-host hpcwire.com && node scripts/verify-production-surface.mjs --local-dist dist --live "$DEPLOY_URL" --out docs/production-verification-report.md --json evidence/task-11-production-surface.json
    Expected: all commands exit 0; both homepage-image audit JSON files contain ok true.
    Evidence: evidence/task-11-production-homepage-images.json

  Scenario: restore metadata has required fields
    Tool:     bash
    Steps:    DEPLOY_URL="$(cat evidence/task-10-vercel-deploy-url.txt)"; FINAL_SHA="$(git rev-parse HEAD)"; printf '# Recovery Point 1\n\nTag: recovery-point-1\nTag message: 복구지점1\nBranch: codex/review-cleanup-public-gates\nCommit before metadata: %s\nDeployment URL: %s\nOrigin main: 4039e5dd88ef418ecf84b17788d1857a992618ac\nEvidence:\n- evidence/task-10-vercel-inspect.txt\n- evidence/task-11-production-homepage-images.json\n- evidence/task-11-production-homepage-images-canonical.json\n- evidence/task-11-production-surface.json\n' "$FINAL_SHA" "$DEPLOY_URL" > docs/recovery-point-1.md; rg -n 'recovery-point-1|복구지점1|Deployment URL|evidence/task-11-production-surface.json' docs/recovery-point-1.md > evidence/task-11-restore-metadata-fields.txt
    Expected: metadata file exists and field scan exits 0.
    Evidence: evidence/task-11-restore-metadata-fields.txt
  ```

  Commit: YES | Message: `docs(recovery): record recovery point 1 metadata` | Files: [docs/recovery-point-1.md, docs/production-verification-report.md]

- [ ] 12. Push branch and annotated restore tag

  What to do: Create annotated tag `recovery-point-1` at the final verified `HEAD` with message `복구지점1`, push branch `codex/review-cleanup-public-gates`, then push the tag. Verify remote branch and tag both point to the final commit.
  Must NOT do: Do not use `--force` or `--force-with-lease` because this plan uses merge commits, not rewritten history. Do not move an existing remote tag; if a remote `recovery-point-1` exists and does not point to `HEAD`, stop and record blocker evidence.

  Parallelization: Can parallel: NO | Wave 5 | Blocks: [final] | Blocked by: [11]

  References (executor has NO interview context - be exhaustive):
  - External: `https://git-scm.com/docs/git-tag` - `git tag -a` creates annotated tag objects and `-m` supplies the tag message.
  - External: `https://git-scm.com/docs/git-push` - pushing branch refs and tag refs to `origin`.
  - Pattern:  `docs/recovery-point-1.md:1` - restore metadata must exist before tagging.

  Acceptance criteria (agent-executable only):
  - [ ] `git tag -n99 recovery-point-1` includes `복구지점1`.
  - [ ] `git ls-remote --heads origin codex/review-cleanup-public-gates` returns the final commit SHA.
  - [ ] `git ls-remote --tags origin recovery-point-1` returns the pushed tag object/ref.
  - [ ] `git rev-parse recovery-point-1^{}` equals `git rev-parse HEAD`.

  QA scenarios (MANDATORY - task incomplete without these):
  ```
  Scenario: branch and tag push pass
    Tool:     bash
    Steps:    FINAL_SHA="$(git rev-parse HEAD)"; if git ls-remote --tags origin recovery-point-1 | rg -q recovery-point-1; then remote_tag="$(git ls-remote --tags origin recovery-point-1 | awk '{print $1}' | head -n 1)"; printf 'remote tag exists: %s\n' "$remote_tag" > evidence/task-12-existing-remote-tag-error.txt; exit 1; fi; git tag -a recovery-point-1 -m '복구지점1'; git push origin codex/review-cleanup-public-gates > evidence/task-12-push-branch.txt 2>&1; git push origin recovery-point-1 > evidence/task-12-push-tag.txt 2>&1; git ls-remote --heads origin codex/review-cleanup-public-gates > evidence/task-12-remote-branch.txt; git ls-remote --tags origin recovery-point-1 > evidence/task-12-remote-tag.txt; test "$(git rev-parse recovery-point-1^{})" = "$FINAL_SHA"
    Expected: branch push and tag push exit 0; local tag dereferences to final HEAD.
    Evidence: evidence/task-12-remote-tag.txt

  Scenario: tag message verification
    Tool:     bash
    Steps:    git tag -n99 recovery-point-1 > evidence/task-12-tag-message.txt && rg -n '복구지점1' evidence/task-12-tag-message.txt
    Expected: command exits 0 and evidence contains the Korean tag message.
    Evidence: evidence/task-12-tag-message.txt
  ```

  Commit: NO | Message: `n/a` | Files: []

## Final verification wave (MANDATORY - after all implementation tasks)
> Runs in PARALLEL. ALL must APPROVE. Surface results to the caller and wait for an explicit "okay" before declaring complete.
- [ ] F1. Plan compliance audit - every task done, every acceptance criterion met
- [ ] F2. Code quality review - diagnostics clean, idioms match, no dead code
- [ ] F3. Real manual QA - every QA scenario executed with evidence captured
- [ ] F4. Scope fidelity - nothing extra shipped beyond Must-Have, nothing Must-NOT-Have introduced

## Commit strategy
- One logical change per commit. Conventional Commits (`<type>(<scope>): <subject>`) plus Lore trailers from `AGENTS.md`.
- Atomic: every commit builds and passes tests on its own.
- No "WIP" / "fix typo squash later" commits on the final branch - clean up before merge.
- Reference the plan file path in the final commit footer: `Plan: plans/recovery-point-1-merge-deploy.md`.

## Success criteria
- All Must-Have shipped; all QA scenarios pass with captured evidence; F1-F4 approved; commit history clean.
