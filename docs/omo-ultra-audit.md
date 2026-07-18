# OMO Ultra Current State Audit

Generated at: 2026-07-18T21:21:49.625Z

## Dirty Worktree Warning

The worktree was not clean during this audit. Do not revert unrelated user or prior-agent changes. Current short status:

```text
M .codex/NEXT.md
 M .github/workflows/update-news.yml
 M IMPLEMENTATION_NOTES.md
 M README.md
 M docs/admin-exclusion-report.md
 M docs/gpt56-full-audit.md
 M docs/omo-ultra-audit.md
 M docs/qa-qc-report.md
 M docs/rendered-public-output-report.md
 M docs/ultraqa-security-report.md
 M scripts/audit-omo-ultra-current-state.mjs
 M scripts/lib/article-image-surface.mjs
 M scripts/lib/constants.mjs
 M scripts/lib/image-generator.mjs
 M scripts/lib/image-providers/chatgpt-oauth-runtime.mjs
 M scripts/lib/image-providers/gemini.mjs
 M scripts/lib/image-providers/openai-image-api.mjs
 M scripts/lib/image-providers/shared.mjs
 M scripts/lib/image2-provider.mjs
 M scripts/lib/production-content-phases.mjs
 M scripts/lib/safe-http-fetch.mjs
 M scripts/regenerate-stock-card-images.mjs
 M tests/homepage-layout.test.mjs
 M tests/image-generation.test.mjs
 M tests/omo-ultra-audit.test.mjs
 M tests/outbound-media-security.test.mjs
 M tests/public-image-display.test.mjs
```

## Framework and Routing System

- Framework: Astro is declared by `package.json` dependencies and configured in `astro.config.mjs`.
- Routing: filesystem routes under `src/pages/`; detected homepage=true, article=true, adminEdit=true, dashboard=true, rss=true, sitemap=true.
- Sitemap filter excludes admin/dashboard/noindex paths: yes.

## Homepage Renderer

- Renderer: `src/pages/index.astro` imports latest/archive JSON and calls `buildHomepageFeed(..., { limit: 50, minimumVisible: 30 })`.
- Current homepage source contains public nav/feed language, but still depends on generated card copy from `scripts/lib/homepage-feed-builder.mjs`.
- Homepage-eligible records found in JSON: 32.
- Evidence: `LatestAnalysisFeed` is the active feed component.

## Article Detail Renderer

- Renderer: `src/pages/news/[id].astro` builds static paths from latest/archive JSON and filters with `isPublicLongformArticle`.
- It uses `ArticleHeader`, `ArticleBody`, `SourceAttribution`, `AIDisclosureFooter`, and related cards.
- Internal metadata is partially guarded by `guardPublicCopy`, `cleanArticleBodyBlocks`, and `forbiddenPublicPhraseMatches`.
- Evidence: route source length 7650 bytes.

## Article Data Store

- Primary public data: `src/data/latest-news.json` (30 records).
- Archive data: `src/data/archived-news.json` (708 records).
- Adjacent stores: `src/data/search-index.json`, `src/data/taxonomy-pages.json`, `src/data/editorial-cycles.json`, `src/data/claim-ledger.json`, `src/data/source-health.json`.
- The data model is still legacy-compatible JSON rather than one explicit public article contract.

## Crawler and Feed Sources

- Feed registry: `scripts/lib/constants.mjs` exports 27 feed definitions.
- Fetcher: `scripts/lib/fetch-feeds.mjs` parses RSS/Atom into `news-pool.json`.
- Source selection and curation flow through `scripts/lib/curate.mjs`, `source-priority-policy.mjs`, and relevance routers.

## Content Generation Pipeline

- Entrypoint: `scripts/pipeline.mjs`.
- Canonical production phases import extraction/relevance/repetition/expert-insight/image gates: yes.
- Generation modules live under `scripts/lib/`, with additional editorial rules in `scripts/lib/AGENTS.override.md`.
- The canonical command surface and production phase composition tie extraction QA, relevance, repetition, image metadata, publication receipts, and public eligibility together; `scripts/pipeline.mjs` remains a compatibility entrypoint (318 bytes).

## Current Image Handling

- Current provider default: `IMAGE_PROVIDER=image2`, `OPENAI_IMAGE_MODEL=gpt-image-2`.
- Provider registry files: `chatgpt-oauth-runtime.mjs`, `gemini.mjs`, `index.mjs`, `openai-image-api.mjs`, `shared.mjs`.
- Duplicate provider files needing cleanup decision: none found.
- Public generated assets directory: `public/generated/`.
- Homepage-eligible records missing a reachable display image or fallback: 0; examples: none found.

## Publish Cron and Build Scripts

- Build: `npm run prepare:static-images && node ./scripts/export-admin-public-read-model.mjs --if-configured && astro build && node ./scripts/prune-dist-images.mjs`.
- Main pipeline script: `node ./scripts/content-command-surface.mjs cycle --production`.
- Content gate: `npm run check && npm run build && node --test tests/public-output.test.mjs tests/image-output.test.mjs tests/image-generation.test.mjs tests/admin-security.test.mjs tests/content-cycle.test.mjs && npm run audit:public && npm run audit:images && npm run audit:admin && npm run audit:performance`.
- GitHub scheduled workflow expected at `.github/workflows/update-news.yml`: present.

## Cache and Purge Mechanism

- Cache purge scripts present: `scripts/purge-public-cache.mjs`=true, `scripts/purge-deployment-cache.mjs`=true.
- Purge uses env-gated hooks and writes reports; live purge must not be claimed unless credentials and HTTP response are captured.

## Current Admin and Dashboard Routes

- Admin edit route: `src/pages/admin/articles/editor.astro`=true.
- Existing admin/serverless APIs cover login, dashboard, articles, article actions, revisions, media, audit, and operations under `api/admin/`.
- Existing dashboard route: `src/pages/admin/dashboard.astro`=true.
- The private CMS includes article queues, editor actions, image regeneration/upload, revision history, audit log, quarantine, source, and pipeline surfaces.

## Authentication and Environment Variables

- Authentication requires `ADMIN_USERNAME`, Argon2id password verification via `ADMIN_PASSWORD_HASH`, and a strong `ADMIN_SESSION_SECRET`: implemented.
- Session revocation, role/action authorization, CSRF validation, login throttling, and audit hooks are enforced by `api/admin/_auth.js`.
- Existing env constants include image, OpenRouter, Supabase, and pipeline settings in `scripts/lib/constants.mjs` (9961 bytes).
- Admin storage is adapter-backed: local atomic storage is development-only and Postgres in production fails closed when unconfigured.

## Deployment Platform Assumptions

- `vercel.json` exists and declares Astro build to `dist`: yes.
- Root `api/admin/*.js` implies Vercel serverless functions rather than Astro `src/pages/api` endpoints.
- Local QA must account for Astro dev/preview and Vercel API behavior differences.

## Stale Generated Article Pages

- Article-page-published records with non-blog_engine_v4 generation version: 1; examples: `99520a2a1435cecd`.
- Source-only/direct-link items: 737.
- Whether generated article pages are stale and need regeneration: yes, any public article not on the current generation version or carrying legacy template phrases needs classify/regenerate/brief/hide/noindex handling.

## Legacy Templates and Public Output Failures

- Why old Editor's Brief templates are still live: legacy JSON body/deck fields still contain old generated copy and article pages are rendered from those persisted fields until migration/regeneration rewrites or hides them. Matches found: 0; examples: none found.
- Why banned phrases still appear: phrase guards exist, but legacy records and fallback/presentation fields predate the current guard path. Current configured/brief phrase matches: 6; examples: `01b8b1d203605f0e`, `15792b758e874b1c`, `watch_sig_f1423df9066ac714`, `watch_sig_d80c14165e487282`, `watch_sig_7ac1e2f684c56c28`.
- Why low-relevance items still appear in the homepage feed: the canonical homepage predicate requires a public destination, source-grounded relevance, source integrity, and presentable card copy; remaining heuristic matches require editorial review rather than bypassing that predicate. Low-relevance homepage examples: 1; examples: `43bfb1d4d4b67121`.
- Why images are not reliably visible per article: display code supports multiple legacy fields and local fallbacks, but not every eligible record has a generated/fallback asset that exists on disk. Missing image examples: none found.
- Clipped extraction fragments detected in persisted public copy: 0; examples: none found.

## Safe Admin Implementation Location

- Where admin should be implemented safely: extend `src/pages/admin/` for noindexed private shells and root `api/admin/` for Vercel-protected APIs, using shared auth/session/CSRF middleware in `api/admin/_auth.js` or a replacement module.
- Admin must remain excluded by `astro.config.mjs` sitemap filter and `src/pages/robots.txt.ts`, and private data must only load after authenticated API calls.
- CMS writes go through `src/admin/admin-cms-service.mjs` and the storage adapters under `src/plugins/storage/`; the GitHub helper is compatibility-only and must not bypass the canonical service.
