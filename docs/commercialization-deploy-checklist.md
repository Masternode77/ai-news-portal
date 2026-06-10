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
- [ ] `/sitemap.xml` includes the five commercial routes
- [ ] `/sitemap-index.xml` exists and references the Astro child sitemap
- [ ] Astro child sitemap includes the five commercial routes
- [ ] `/robots.txt` exists
- [ ] Admin/dashboard pages do not leak into public sitemap checks

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

## 6. Rollback

Preferred rollback order:

- [ ] Redeploy the prior known-good Vercel deployment.
- [ ] Or revert the final commercialization release commit.
- [ ] Re-run postdeploy smoke on the restored deployment.
- [ ] Record the rollback commit/deployment ID and reason.

Do not use destructive git commands such as `git reset --hard` for rollback unless explicitly approved.
