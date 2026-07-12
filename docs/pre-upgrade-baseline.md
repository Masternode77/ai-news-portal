# Pre-upgrade baseline

Recorded: 2026-07-11

## Safety checkpoint

- Repository: `Masternode77/ai-news-portal`
- Production: `https://www.computecurrent.com/`
- Production Git SHA: `19089b66627be58d5066376902ff382d2a018137`
- Latest functional baseline on `origin/main`: `e42681f1b643ad90957c7795e9d3c27ea17a14ed`
- Upgrade branch: `upgrade/gpt-5-6-sol`
- Rollback tag: `backup/pre-gpt56-upgrade-20260711T091118Z`
- Previous local branch: `codex/upgrade3`
- Previous local HEAD: `53ed746808678fb393d617169a64e82f991b8aae`
- Merge base of the previous local branch and `origin/main`: `51bc1703ca6d8c61708bd3a66ae69d177f4b80f9`

The production SHA is an automated dashboard snapshot commit. The latest functional
change beneath it is `e42681f1`, followed by 163 generated-data commits. The sibling
local functional commit `6e5d9114` is equivalent except for generated-state test data,
so it is not replayed. Security/dependency and repository-guidance commits were
replayed onto the upgrade branch.

## Deployment baseline

- Vercel project: `ai-news-portal` (`prj_CkpRjLEoOEgwPfH2n6hOlxpeqFro`)
- Vercel team: `team_9yy2QENPc6trR6HTlMm2R6Vj`
- Production deployment: `dpl_GBoeuaBSNsDaKbWoJPmxrttV7hx8`
- Deployment URL: `https://ai-news-portal-5nt177ks5-masternode77s-projects.vercel.app`
- Production aliases: `computecurrent.com`, `www.computecurrent.com`
- Deployment state at audit: Ready
- Vercel runtime: Node 24.x
- GitHub Actions runtime: Node 22

The rollback path is to redeploy the tagged production SHA. No main-branch rewrite,
production deployment, cache purge, database migration, or production secret change
is part of this checkpoint.

## Measured baseline

- Production build: 1,532 static pages, approximately one minute on Vercel.
- Clean local `origin/main` build: 33.86 seconds.
- `dist/`: approximately 292.6 MB.
- `src/data/`: approximately 31.8 MB.
- `public/generated/`: approximately 219.0 MB on clean `origin/main`.
- Homepage HTML: 113,013 bytes.
- Referenced homepage images: 46 WebP files, approximately 2.25 MB total.
- Homepage CSS: 70,877 bytes; JavaScript is minimal.
- Local network production TTFB: 37.9 ms; total HTML transfer: 41.2 ms.
- Origin `main` dependency audit: 18 vulnerabilities (9 high, 9 moderate).
- Upgrade branch dependency audit after the preserved security commit: 0.
- Clean build then test on `origin/main`: 252/256 tests passed.

The four baseline test failures concern a stale homepage heading assertion, an SVG
image fallback assertion after WebP migration, and two failures caused by the current
absence of a qualifying public long-form item. Tests are order-dependent because
several public-output tests assume `dist/` already exists.

## Production surface baseline

- All five operational explanation routes return 200 and are linked publicly.
- Both sitemap systems include operational routes and disagree about URL inventory.
- RSS has one item; both sitemap systems expose only one article.
- Fourteen empty taxonomy pages are indexable.
- The homepage contains 48 cards and includes clearly irrelevant stories.
- The only available article is approximately 235 rendered words.
- Public admin shells exist, but login and required CMS routes are incomplete.
- Admin APIs fail closed without credentials but return 500 and disclose variable names.
- `/dashboard` publishes internal job payloads and local operational details.

## Rollback verification

The annotated tag resolves to the production SHA and is independent of the upgrade
branch. Before any merge, preview verification must prove that the tagged revision can
still be selected for a Vercel redeploy. Production remains unchanged until all preview
gates pass.

## 2026-07-12 Security Checkpoint

After adding the Postgres and Vercel Blob adapters, `npm audit --audit-level=low` still
reports `found 0 vulnerabilities`. Runtime folders (`.omx`, `.omo`, `.cache`, `dist`,
`artifacts`, and `evidence`) remain ignored and are not release inputs. No tracked AGENTS
guidance file is modified in the admin CMS checkpoint.
