# Rollback Runbook

Updated: 2026-07-12

## Code Rollback

The pre-upgrade source is preserved by tag
`backup/pre-gpt56-upgrade-20260711T091118Z` at `19089b66627be58d5066376902ff382d2a018137`.
Do not move or delete the tag. Roll back production by redeploying the last known-good Vercel
deployment or by a reviewed revert commit on `main`; never reset or force-push shared history.

## Data Rollback

Before migration or production enablement, take a managed Postgres backup and export the public
read model. Schema changes are forward migrations; destructive down migrations are not assumed.
If the CMS path fails, disable admin access, stop rebuild triggers, redeploy the known-good
static release, and retain Postgres/Blob evidence for recovery.

Public media promotion writes deterministic `published-admin-media/` objects. Private source
objects and audit/revision rows must not be deleted during an application rollback. Publication
outbox events remain pending through builds and deployments, allowing safe replay. They must
only be acknowledged by a future consumer that verifies the deployed read-model version.

## Validation

After rollback, verify the production commit/deployment ID, homepage, one article, RSS, sitemap,
robots, admin denial, response headers, and image delivery. Record the exact rollback deployment
and do not claim cache invalidation unless a purge command succeeds.

The rollback tag was checked out in an isolated worktree on 2026-07-12. `npm ci` completed and
`npm run build` produced `dist/index.html`, 1,532 index pages, and approximately 286 MB of output.
The baseline dependency tree still reports 18 known vulnerabilities, so this is an emergency
code rollback target, not a forward security-quality target. The worktree was removed after the
receipt was recorded; no rollback deployment or cache purge was performed.
