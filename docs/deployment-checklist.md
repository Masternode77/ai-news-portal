# Deployment Checklist

Generated at: 2026-05-31T08:00:00.000Z

> **Historical snapshot — non-operational.** This checklist records 2026-05-31 deployment evidence and must not be used as the current activation procedure. Use [`DEPLOY_CHECKLIST_DASHBOARD.md`](../DEPLOY_CHECKLIST_DASHBOARD.md), [`admin-setup.md`](admin-setup.md), [`admin-auth-production-gate.md`](admin-auth-production-gate.md), and [`commercialization-deploy-checklist.md`](commercialization-deploy-checklist.md) for current operator requirements.

This checklist separates local, staging, and production actions so credentialed steps are not confused with local proof. Do not claim live freshness until a deployment run records live URL checks and a cache purge result.

## Commands Run

- `node scripts/audit-env-docs.mjs --env .env.example --docs docs/admin-setup.md docs/image-generation-setup.md docs/content-cycle-runbook.md docs/automation-runbook.md docs/deployment-checklist.md`
- `node scripts/admin-password-hash.mjs --password test-password --dry-run`
- `npm run content:gate`
- `node scripts/verify-production-surface.mjs --local-dist dist --live https://www.computecurrent.com --out docs/production-verification-report.md --json evidence/compute-current-omo-ultra-rebuild/task-16-production.json`

## Artifacts

- Environment example: `.env.example`
- Admin setup: `docs/admin-setup.md`
- Image setup: `docs/image-generation-setup.md`
- Content cycle runbook: `docs/content-cycle-runbook.md`
- Automation runbook: `docs/automation-runbook.md`
- Production verification report: `docs/production-verification-report.md`

## Pass/Fail

- Passed: env-docs audit documented 28 required environment variables across the setup/runbook docs.
- Passed: password hash dry run produced hash metadata without exposing the plaintext password.
- Blocked/skipped: cache purge is skipped without `COMPUTE_CURRENT_CACHE_PURGE_URL`.

## Remaining Risks

- Production secrets must be rotated and entered in the deployment platform before enabling admin writes, paid generation, or purge hooks.
- Live smoke checks should be repeated after every deploy because local build evidence cannot prove CDN freshness.
- GitHub token scopes should stay limited to the content repository and branch used by the admin write path.

## Cleanup Receipts

- No real secret was written to `.env.example`, docs, logs, or screenshots.
- The hash dry run created no persistent credential.
- The production verification harness creates markdown/JSON evidence only and leaves no running resource.

## Local Verification

1. Copy `.env.example` to `.env` and fill only local-safe values.
2. Generate `ADMIN_PASSWORD_HASH` with `node scripts/admin-password-hash.mjs --password "<temp>" --dry-run`.
3. Use `PIPELINE_OFFLINE=1` unless testing live fetches.
4. Run `npm run content:gate`.
5. Confirm `/admin.html` is noindexed and login-gated.

## Staging Verification

1. Configure staging `ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH`, and `ADMIN_SESSION_SECRET`.
2. Configure `IMAGE_PROVIDER=image2`; add `OPENAI_API_KEY` only if staging should generate paid images.
3. Configure GitHub token access only to the staging branch.
4. Run `npm run content:cycle`, then `npm run content:gate`.
5. Run `npm run purge:cache` and confirm the report is either purged or explicitly skipped due missing cache-purge credentials.

## Production Verification

1. Rotate secrets before first production launch or after any suspected exposure.
2. Set production `COMPUTE_CURRENT_CACHE_PURGE_URL` and optional `COMPUTE_CURRENT_CACHE_PURGE_TOKEN`.
3. Confirm `GITHUB_REPO`, `GITHUB_BRANCH`, and GitHub token scopes.
4. Confirm `OPENROUTER_API_KEY` and image-generation credentials are intentionally enabled.
5. Run live smoke checks for homepage, article page, RSS, sitemap, admin login, image rendering, and cache purge.
6. Record evidence before claiming live production verification.

Never paste real API keys, bearer tokens, or admin passwords into docs, screenshots, tickets, or commits.

`VERCEL_DEPLOY_HOOK_URL` is a deployment trigger, not a cache-purge endpoint; do not use it for purge runs.

Pipeline commits to `main` must NOT carry `[skip ci]` in the message: Vercel honors that marker and skips the production deployment, which leaves refreshed articles and authored columns committed to the repository but never published to the live site. GitHub Actions noise is prevented by triggers instead (visual-qa runs on pull requests only; the release job skips bot actors).

Intake health: only sources whose registry entry carries an approved `text_use_basis` (plus a valid `terms_url` and a `reviewed_at` within the review window) are fetched at all — `activeRegistryFeeds()` in `scripts/lib/source-registry.mjs` is the gate. If columns start reporting `no_qualifying_story` run after run, check how many feeds that function returns before suspecting the engine: with a single authorized source the pool drains within days. Add rights-clean sources (US federal public domain, CC BY) to `config/sourceRegistry.yml` rather than weakening the gate.

For live production checks from restricted environments, dispatch the `Prod Smoke` workflow (`prod-smoke.yml`) — it probes the homepage, column surfaces, RSS, and sitemap from a GitHub-hosted runner and prints status codes plus content markers into the job log.
