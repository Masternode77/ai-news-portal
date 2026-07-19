# Upstream Integration Preflight

Generated at: 2026-07-19T00:58:54.810Z

## Result

- Integration ready: no
- Current commit: `2b78941fcd1fe4c9abedd6f03c043d681183f125`
- Upstream commit: `f345f6798f90ef82c37fc01fd537157e112eafc9`
- Ahead / behind: 56 / 128
- Overlapping paths: 8
- Conflicts: 8
- Unexpected source/config conflicts: 0

## Commands Run

- `npm run audit:integration -- --revision=origin/main --out=docs/upstream-integration-preflight.md --json=artifacts/preview-c9518bee/integration-preflight.json`

## Artifacts

- `docs/upstream-integration-preflight.md`
- `artifacts/preview-c9518bee/integration-preflight.json`

## Pass/Fail

- Native Git merge simulation: blocked by conflicts
- Raw upstream integration: blocked
- Unexpected source/config conflict gate: passed

## Conflicts

- `public/dashboard-data.json` — modify-delete; retired-runtime-artifact
- `public/generated/articles/d52452aa34a12965-could-scotland-freeze-data-centre-projects-and-stall-uk-ai-ambitions/hero.webp` — binary-content; generated-image
- `public/generated/articles/d52452aa34a12965-could-scotland-freeze-data-centre-projects-and-stall-uk-ai-ambitions/og.webp` — binary-content; generated-image
- `public/generated/articles/d52452aa34a12965-could-scotland-freeze-data-centre-projects-and-stall-uk-ai-ambitions/thumbnail.webp` — binary-content; generated-image
- `public/generated/d52452aa34a12965.webp` — binary-content; generated-image
- `src/data/archived-news.json` — content; generated-data-projection
- `src/data/latest-news.json` — content; generated-data-projection
- `src/data/search-index.json` — content; generated-data-projection

## Remaining Risks

- Upstream integration remains blocked until guarded reconciliation and projection regeneration resolve every listed conflict.
- This receipt does not execute provider-backed content reconciliation or approve production promotion.

## Cleanup Receipts

- Repository Git object database writes: none
- Merge-simulation working-tree writes: none
- Requested receipt writes: docs/upstream-integration-preflight.md, artifacts/preview-c9518bee/integration-preflight.json
- Isolated temporary Git objects and merge files: cleaned
- Generated JSON and image conflicts must be resolved by guarded reconciliation and regenerated projections, not raw merge acceptance.
