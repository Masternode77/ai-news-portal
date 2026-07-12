# Release Runbook

Updated: 2026-07-12

## Preconditions

1. Work only from `upgrade/gpt-5-6-sol`; never force-push `main`.
2. Confirm backup tag `backup/pre-gpt56-upgrade-20260711T091118Z` resolves to the recorded
   production baseline.
3. Require a clean intentional diff, zero merge conflicts, zero dependency vulnerabilities,
   passing tests, build, content gate, rendered QA, and independent code review.
4. Provision preview-only Postgres and private Blob credentials. Run `npm run admin:migrate`.
5. Configure an Argon2id `ADMIN_PASSWORD_HASH`, session secret, role mapping, and preview rebuild
   trigger. Do not copy production secrets into local files or reports.

## Preview

1. Create a Vercel preview from the upgrade branch without assigning production domains.
2. Verify public homepage, archive, search, article, RSS, sitemap, retired routes, headers,
   images, responsive layouts, and Lighthouse.
3. Verify unauthorized admin denial, login, CRUD, upload, preview, publish, public visibility,
   unpublish, soft delete, restore, revision history, permanent-delete confirmation, logout,
   and persistence after a fresh deployment/process.
4. Record the preview URL, deployment ID, commit SHA, screenshots, DB migration receipt, and
   every skipped credential-dependent check.
5. Run the managed probe in two invocations with preview credentials only:
   `VERCEL_ENV=preview ADMIN_PERSISTENCE_SCOPE=preview npm run admin:verify-managed -- --phase=write --target=preview --deployment=<before>`;
   after a fresh process or preview deployment, run it with `--phase=verify` and
   `--deployment=<after>`. Retain the ignored receipt without checking in credentials or state.

## Merge And Production

Production promotion requires explicit preview approval. Create a reviewed PR with migration,
risk, and rollback notes; merge without rewriting main history; deploy once; then run production
smoke checks. Cache purge is a separate production action and must be recorded only if it
actually runs.
