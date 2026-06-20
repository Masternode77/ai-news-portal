# Article Graphics Image2/Origin Plan

## Objective
Preserve the current Compute Current repo state, then ensure every reader-facing blog/signal article surface has graphical imagery. Priority order: existing/new image2 or canonical generated assets, trusted origin source artwork canonicalized locally, then local graphical fallback.

## Current Snapshot
- Base commit: `2827e0041ecf7e900ca8db2d64535e0e83822d2c`
- Snapshot tag: `repo-snapshot-before-article-graphics-20260604`
- Pre-existing dirty files before this task: `public/dashboard-data.json`, `plans/homepage-premium-redesign.md`
- Dirty-state patches: `.omo/ulw-loop/article-graphics-20260604/restore/`

## Execution Waves

### Wave 1 - RED Tests
Task A owns `tests/article-origin-canonicalization.test.mjs`.
- Baseline characterization: local source image backfills canonical hero/thumbnail/og WebP variants.
- RED: remote `sourceImage` fixture served from local HTTP must backfill canonical hero/thumbnail/og WebP variants when no image2/local generated asset exists.
- Edge RED: empty or malformed source URLs must not throw and must report a skipped canonicalization.
- Verification: `node --test tests/article-origin-canonicalization.test.mjs`.

Task B owns `tests/public-image-display.test.mjs` or a new public-audit test.
- Baseline characterization: image2/canonical metadata still beats source artwork.
- RED: homepage feed presentation must not expose remote `sourceImage` for articles that can be canonicalized locally.
- Verification: targeted `node --test` command.

### Wave 2 - Smallest GREEN
Task C owns `scripts/prepare-static-images.mjs`.
- Add a safe remote origin fetch path used only by `ensureCanonicalArticleImageSet`.
- Keep existing local-source behavior unchanged.
- Validate source URLs as `http`/`https`, fetch with timeout, require `image/*` content-type when available, convert via `sharp` into canonical WebP variants.
- Return explicit skipped reasons for malformed/empty/fetch/invalid-image cases.
- No new dependencies.

Task D owns public data refresh if generated assets or metadata must change.
- Run `PIPELINE_OFFLINE=1 npm run prepare:static-images`.
- Review generated files and JSON diffs; do not touch unrelated existing dirty files unless the command intentionally updates public feed image metadata.

### Wave 3 - QA and Evidence
Task E owns C002 tmux/HTTP fixture evidence.
- Run the remote-source fixture through `ensureCanonicalArticleImageSet`.
- Capture JSON evidence and tmux transcript under `.omo/ulw-loop/article-graphics-20260604/evidence/`.
- Clean fixture server, temp dirs, and tmux session.

Task F owns C001 browser evidence.
- Build and preview.
- Use Playwright/browser on `/`, `/archive`, `/category/data-centers`, and one `/news/<id>` page.
- Capture JSON and screenshots under `.omo/ulw-loop/article-graphics-20260604/evidence/`.
- Clean preview server/browser.

Task G owns C003 regression HTTP evidence.
- Run `PIPELINE_OFFLINE=1 npm run build`, image audit, and curl representative image URLs.
- Capture JSON and curl transcript with cleanup receipt.

### Wave 4 - Final Gate
- Run targeted tests, full test suite, lint/typecheck/build where available.
- Run ai-slop-cleaner/no-op cleanup receipt for changed files.
- Run code review.
- If clean, commit with Lore protocol, push branch/tag, deploy to Vercel if deployment remains authorized by user context, then record ULW checkpoint.

## Critical Path
Wave 1 tests block Wave 2 implementation. Wave 2 blocks all QA. C001 and C003 can run in parallel after build readiness, while C002 can run independently against a fixture after implementation.
