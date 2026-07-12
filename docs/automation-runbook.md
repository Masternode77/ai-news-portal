# Automation Runbook

This repo supports a scheduled content cycle, image regeneration, migration dry runs, and rendered quality gates. Automations should be credential-aware: local and CI runs may skip live network or purge steps when secrets are absent.

## Scheduled Commands

- `npm run content:cycle`: fixture-backed content cycle.
- `node scripts/schedule-content-cycle.mjs`: scheduler wrapper using `CONTENT_CYCLE_FIXTURE`.
- `npm run migrate:legacy -- --dry-run`: read-only legacy classification report; apply mode is disabled.
- `npm run regen:latest100`: latest-100 regeneration report.
- `npm run generate:missing-images -- --dry-run`: fallback image assignment report.
- `npm run purge:cache`: cache purge or documented credential skip.
- `npm run content:gate`: full local quality gate.

## Credential Boundaries

Do not run production-mutating commands without explicit production credentials and a rollback plan. In local/CI contexts, prefer `PIPELINE_OFFLINE=1`, `--dry-run`, and report-only migration modes.

## Incident Notes

If a scheduled cycle produces zero public items, inspect the admin review queue first. The expected safe behavior is no public publish, a review queue reason, and a heartbeat/report artifact.

If image generation fails, category fallback metadata is acceptable; broken image boxes are not.
