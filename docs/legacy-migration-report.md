# Legacy Migration Report

Generated at: 2026-05-31T06:55:15.628Z
Mode: dry-run
Audit limit: 200
Regeneration limit: 100

## Classification Counts

- regenerate_longform: 42
- regenerate_brief: 12
- assign_fallback_image: 0
- hidden_noindex: 145
- delete_or_410: 1

## Named Brief Examples

- NetApp: hidden_noindex - NetApp: NetApp Expands OpenShift Data Management With Faster VM Backup, DR, and Cloud Scale Support
- AppStoreAI: hidden_noindex - The App Store is booming again, and AI may be why
- LandAndExpand: regenerate_brief - Land and Expand: NVIDIA, IREN, Coatue, Microsoft, Switch, Cerebras, Core Scientific

## Artifact Refresh

- latestNews
- searchIndex
- taxonomyPages
- rssItems
- sitemapEntries
- imageAssignments
- rollback

Rollback records: 200
Search index records: 54
Sitemap entries: 36
RSS items: 0

## Commands Run

- `node scripts/migrate-legacy-content.mjs`
- `node scripts/regenerate-latest100.mjs`
- `node scripts/generate-missing-images.mjs`
- `npm run purge:cache`
- `npm run check`
- `npm run build`

## Artifacts

- Migration log: `evidence/compute-current-omo-ultra-rebuild/task-13-migrate.log`
- Latest 100 regeneration log: `evidence/compute-current-omo-ultra-rebuild/task-13-regenerate.log`
- Missing images log: `evidence/compute-current-omo-ultra-rebuild/task-13-missing-images.log`
- Rollback map: `docs/legacy-migration-rollback.json`
- Regeneration report: `docs/latest100-regeneration-report.md`
- Missing images report: `docs/missing-images-report.md`

## Pass/Fail

- Passed: migration classified 42 records for longform regeneration, 12 for brief regeneration, 145 as hidden/noindex, and 1 for delete/410 handling.
- Passed: latest eligible regeneration queue reported 54 image-ready records.
- Passed: missing-image assignment reported 0 missing images after fallback handling.
- Blocked/skipped: public cache purge recorded a credential-gated skip.

## Remaining Risks

- Regeneration actions are local migration classifications until a credentialed content-cycle run writes production content.
- Hidden/noindex decisions should be spot-checked before deleting legacy source records permanently.
- Any future migration should preserve the rollback JSON until production verification passes.

## Cleanup Receipts

- Migration scripts wrote reports and rollback artifacts only; no server, tmux session, or browser context remained active.
- `public/dashboard-data.json` was restored after build-time timestamp updates.
- Cache purge skip was recorded in `docs/public-cache-purge-report.md` without creating remote side effects.
