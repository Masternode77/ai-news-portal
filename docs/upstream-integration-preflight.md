# Upstream Integration Preflight

Generated at: 2026-07-19T01:39:43.860Z

## Result

- Integration ready: no
- Current commit: `5989eb4404486a26c46e377413c9dfb6b2dfbb8d`
- Upstream commit: `f345f6798f90ef82c37fc01fd537157e112eafc9`
- Audit script SHA-256: `4f44b9ce3978c8a4440f10a490aa1f1bdeb19f0454621ca95a5d8fcfb5d7de61`
- Ahead / behind: 57 / 128
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
