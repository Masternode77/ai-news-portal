# Compute Current Commercialization Deploy Checklist

## Scope

Ship the static wave-1 commercialization surface only:

- `/subscribe/`
- `/pricing/`
- `/sample/`
- `/briefing/`
- `/contact/`

No payment, login, gated content, newsletter-provider form, CRM backend, or outreach automation is included in this release.

## 1. Predeploy

- [ ] Confirm the backup tag exists: `git tag --list 'hermes-update-*'`
- [ ] Confirm dirty unrelated files are understood and not reverted.
- [ ] Record whether valid `PUBLIC_ADSENSE_CLIENT` and `PUBLIC_GA4_ID` values are configured. Valid IDs alone do not activate Google tags.
- [ ] Keep `PUBLIC_GOOGLE_CMP_READY=false` until account/site approval, real account-issued ads.txt IDs, certified CMP publication, EEA/UK/CH accept/reject/revoke tests, and legal review are all evidenced.
- [ ] Keep `PUBLIC_ADSENSE_CONTENT_READY=false` until a meaningful manually reviewed original article inventory includes at least one canonical detail article with `publication_integrity.ok=true`. This environment attestation cannot override zero or invalid inventory because the code-level nonzero verified-detail floor remains active.
- [ ] Initial launch uses configured manual units only. Keep Auto ads disabled until post-approval production DOM, placement, and accessibility QA explicitly attests that automated placements do not bypass the verified advertising surface.
- [ ] Complete the external-account checklist: AdSense account/site ownership, legal entity and payment/tax details, CMP vendor configuration, jurisdiction-specific legal review, and documented data-retention decisions.
- [ ] Before enabling production admin access, complete [the admin authentication production gate](admin-auth-production-gate.md); leave `ADMIN_VERCEL_RATE_LIMIT_READY=false` until the blocking Vercel Firewall rule is published and tested.
- [ ] Run `npm run check`
- [ ] Run `npm run build`
- [ ] Run focused gate:

```bash
node --test tests/commercialization-surface.test.mjs tests/homepage-link-integrity.test.mjs tests/rss-builder.test.mjs tests/sitemap-builder.test.mjs tests/content-cycle.test.mjs
npm run audit:homepage
npm run audit:feed-volume
```

- [ ] Run full gate: `npm run content:gate`
- [ ] Run commercial visual QA:

```bash
npm run qa:visual:commercial
```

If local Playwright is unavailable, the command must write `artifacts/visual-status/commercial-visual.json` with `reason: playwright_not_installed`; CI must fail until Playwright is available.

## 2. Local Smoke

Run:

```bash
node scripts/verify-production-surface.mjs \
  --dist dist \
  --json .omo/evidence/task-15-production-readiness.json \
  --out .omo/evidence/task-15-production-readiness.md
```

Required local checks:

- [ ] `/` exists and links to `/subscribe/`, `/pricing/`, `/sample/`, `/briefing/`, `/contact/`, and `/archive/`
- [ ] `/subscribe/` exists
- [ ] `/pricing/` exists
- [ ] `/sample/` exists
- [ ] `/briefing/` exists
- [ ] `/contact/` exists
- [ ] `/archive/` exists
- [ ] `/rss.xml` exists
- [ ] Every local RSS `/news/<id>/` link maps to a built article page
- [ ] `/sitemap.xml` includes `/contact/` and excludes the noindex conversion routes `/subscribe/`, `/pricing/`, `/sample/`, and `/briefing/`
- [ ] `/sitemap-index.xml` exists and references the Astro child sitemap
- [ ] Astro child sitemap includes `/contact/` and excludes the noindex conversion routes `/subscribe/`, `/pricing/`, `/sample/`, and `/briefing/`
- [ ] `/robots.txt` exists
- [ ] Admin/dashboard pages do not leak into public sitemap checks
- [ ] `/ads.txt` contains the exact account-issued `google.com, pub-…, DIRECT, f08c47fec0942fa0` line when `PUBLIC_ADSENSE_CLIENT` is valid, even while `PUBLIC_GOOGLE_CMP_READY=false`
- [ ] Before enabling AdSense, record the meaningful manually reviewed original article inventory and verify the code-level nonzero canonical `publication_integrity.ok=true` detail-article floor. `PUBLIC_ADSENSE_CONTENT_READY=true` alone must leave ads disabled for zero or invalid inventory.
- [ ] `/privacy/` has no Google advertising, Analytics, or consent-message runtime
- [ ] `vercel.json` has `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: SAMEORIGIN`, and the declared `Permissions-Policy`; the documented risk acceptance is no enforced CSP for this static AdSense/CMP architecture. Do not add report-only CSP without a collector, and do not add report-only or enforced CSP until a per-request nonce-capable architecture or validated compatible policy exists.

## 3. Deploy

- [ ] Confirm deployment authority for the target branch and Vercel project.
- [ ] Commit the scoped release files only.
- [ ] Push through the normal GitHub/Vercel flow, or run the approved Vercel deployment command for this repository.
- [ ] Do not run article regeneration or pipeline commands as part of this commercial surface deploy.

## 4. Cache Purge

Use only configured credentials:

- `COMPUTE_CURRENT_CACHE_PURGE_URL`
- `COMPUTE_CURRENT_CACHE_PURGE_TOKEN`

If no dedicated purge URL is configured, record the blocker and do not invent a purge path. Do not use `VERCEL_DEPLOY_HOOK_URL` as a cache-purge endpoint; deploy hooks belong only in an explicitly approved deploy step.

## 5. Postdeploy Smoke

Run:

```bash
node scripts/verify-production-surface.mjs \
  --dist dist \
  --live https://www.computecurrent.com \
  --json .omo/evidence/task-16-production.json \
  --out .omo/evidence/task-16-production.md
```

Required live checks:

- [ ] `https://www.computecurrent.com/` returns 200
- [ ] `/subscribe/`, `/pricing/`, `/sample/`, `/briefing/`, `/contact/`, and `/archive/` return 200
- [ ] `/rss.xml`, `/sitemap.xml`, `/sitemap-index.xml`, and `/robots.txt` return 200
- [ ] Homepage has zero broken local `/news/` links
- [ ] Every local RSS `/news/` link returns 200
- [ ] `https://computecurrent.com/` redirects to `https://www.computecurrent.com/`
- [ ] `computrcurrent.com` still does not resolve unless a separate domain migration is approved
- [ ] `https://www.computecurrent.com/ads.txt` returns `Content-Type: text/plain; charset=utf-8`
- [ ] Relevant public content pages show at most one configured Google loader; `/privacy/` shows none
- [ ] For applicable EEA/UK/Swiss testing, the footer **Privacy choices** control can reopen the Google revocation flow; if it is absent, record whether the visitor is outside the applicable region or the CMP handoff is not active
- [ ] Follow the invalid-traffic and no-self-click procedure in `docs/adsense-operations-runbook.md`; do not treat review or revenue as guaranteed outcomes
- [ ] Keep Auto ads disabled for this initial manual-unit release. A later change requires the recorded post-approval production DOM, placement, and accessibility QA named in the operations runbook.

## 6. Rollback

Preferred rollback order:

- [ ] Redeploy the prior known-good Vercel deployment.
- [ ] Or revert the final commercialization release commit.
- [ ] Re-run postdeploy smoke on the restored deployment.
- [ ] Record the rollback commit/deployment ID and reason.

Do not use destructive git commands such as `git reset --hard` for rollback unless explicitly approved.
