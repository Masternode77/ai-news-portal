# Repo Branch Hygiene Report

Generated at: 2026-05-20T13:45:00Z

## Current State

- Active branch: `main`
- Main HEAD before launch edits: `ac186b12`
- `origin/main` before launch edits: `ac186b12`
- `main` and `origin/main` matched before launch work began.
- Launch work is being landed directly on `main` after confirming it was not a stale branch.

## Merged Stale Branches

These branches were already merged into `main` and are safe cleanup candidates:

- `emergency/content-quality-cleanup`
- `content-quality-gate`
- `codex/continue-image-migration`
- `Text-Image-Revision`
- `codex/implement-image-provider-abstraction`
- `feature/openai-image-provider`

Remote merged branches observed:

- `origin/emergency/content-quality-cleanup`
- `origin/content-quality-gate`
- `origin/codex/continue-image-migration`

Remote branch deletion was not performed in this launch pass. Recommendation: delete the merged remote branches in GitHub after confirming no open PR depends on them.

## Vercel Analytics Branch

`origin/vercel/install-vercel-web-analytics-5simyp` contains a single commit, `a0a58850`, that adds `@vercel/analytics`, inserts `<Analytics />` in `src/layouts/Layout.astro`, and refreshes generated dashboard data.

Decision: integrate the dependency and `Layout.astro` analytics hook into the launch work, but do not cherry-pick the stale generated `public/dashboard-data.json` timestamp. This keeps the useful analytics change without reintroducing generated-data churn from an older branch.

## Branch Graph Summary

`main` currently contains `ac186b12`, which includes the prior public/admin separation and editorial v2 cleanup. The unmerged Vercel analytics branch is a narrow side branch. The listed content-quality and image-provider branches are merged or superseded by `main`.

## Recommendation

- Keep `main` as the launch branch.
- Push the final launch commit to `origin/main`.
- After production verification, clean up merged local branches and merged remote branches through standard GitHub branch deletion.
