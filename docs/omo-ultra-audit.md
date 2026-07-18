# OMO Ultra Current State Audit

Generated at: 2026-05-31T03:41:52.295Z

## Dirty Worktree Warning

The worktree was not clean during this audit. Do not revert unrelated user or prior-agent changes. Current short status:

```text
M .omo/boulder.json
?? docs/omo-ultra-audit.md
?? plans/compute-current-omo-ultra-rebuild.md
?? scripts/audit-omo-ultra-current-state.mjs
?? tests/omo-ultra-audit.test.mjs
```

## Framework and Routing System

- Framework: Astro is declared by `package.json` dependencies and configured in `astro.config.mjs`.
- Routing: filesystem routes under `src/pages/`; detected homepage=true, article=true, adminEdit=true, dashboard=true, rss=true, sitemap=true.
- Sitemap filter excludes admin/dashboard/noindex paths: yes.

## Homepage Renderer

- Renderer: `src/pages/index.astro` imports latest/archive JSON and calls `buildHomepageFeed(..., { limit: 50, minimumVisible: 30 })`.
- Current homepage source contains public nav/feed language, but still depends on generated card copy from `scripts/lib/homepage-feed-builder.mjs`.
- Homepage-eligible records found in JSON: 49.
- Evidence: `LatestAnalysisFeed` is the active feed component.

## Article Detail Renderer

- Renderer: `src/pages/news/[id].astro` builds static paths from latest/archive JSON and filters with `isPublicLongformArticle`.
- It uses `ArticleHeader`, `ArticleBody`, `SourceAttribution`, `AIDisclosureFooter`, and related cards.
- Internal metadata is partially guarded by `guardPublicCopy`, `cleanArticleBodyBlocks`, and `forbiddenPublicPhraseMatches`.
- Evidence: route source length 5335 bytes.

## Article Data Store

- Primary public data: `src/data/latest-news.json` (50 records).
- Archive data: `src/data/archived-news.json` (439 records).
- Adjacent stores: `src/data/search-index.json`, `src/data/taxonomy-pages.json`, `src/data/editorial-cycles.json`, `src/data/claim-ledger.json`, `src/data/source-health.json`.
- The data model is still legacy-compatible JSON rather than one explicit public article contract.

## Crawler and Feed Sources

- Feed registry: `scripts/lib/constants.mjs` exports 27 feed definitions.
- Fetcher: `scripts/lib/fetch-feeds.mjs` parses RSS/Atom into `news-pool.json`.
- Source selection and curation flow through `scripts/lib/curate.mjs`, `source-priority-policy.mjs`, and relevance routers.

## Content Generation Pipeline

- Entrypoint: `scripts/pipeline.mjs`.
- Pipeline imports extraction/relevance/repetition/expert-insight/image gates: yes.
- Generation modules live under `scripts/lib/`, with additional editorial rules in `scripts/lib/AGENTS.override.md`.
- Risk: the current pipeline has many guard modules but not one audited end-to-end public contract tying extraction QA, tiering, image metadata, rendered output, and admin review queue together.

## Current Image Handling

- Current provider default: `IMAGE_PROVIDER=chatgpt`, `OPENAI_IMAGE_MODEL=gpt-image-2`.
- Provider registry files: `chatgpt-oauth-runtime.mjs`, `gemini.mjs`, `index.mjs`, `openai-image-api.mjs`, `shared.mjs`.
- Duplicate provider files needing cleanup decision: none found.
- Public generated assets directory: `public/generated/`.
- Homepage-eligible records missing a reachable display image or fallback: 0; examples: none found.

## Publish Cron and Build Scripts

- Build: `npm run sync:dashboard-data && npm run prepare:static-images && astro build`.
- Main pipeline script: `node ./scripts/pipeline.mjs`.
- Content gate: `npm run audit:public-copy && npm run audit:public-images && npm run audit:homepage && npm run audit:article-quality && npm run audit:feed-volume`.
- GitHub scheduled workflow expected at `.github/workflows/update-news.yml`: present.

## Cache and Purge Mechanism

- Cache purge scripts present: `scripts/purge-public-cache.mjs`=true, `scripts/purge-deployment-cache.mjs`=true.
- Purge uses env-gated hooks and writes reports; live purge must not be claimed unless credentials and HTTP response are captured.

## Current Admin and Dashboard Routes

- Admin edit route: `src/pages/admin/edit/[id].astro`=true.
- Existing admin/serverless APIs: `api/admin/login.js`, `api/admin/article.js`, `api/admin/_auth.js`, `api/admin/_github.js`.
- Existing dashboard route: `src/pages/dashboard.astro`=true.
- Current admin is an article editor seed, not the requested full CMS dashboard/review queue/image regeneration surface.

## Authentication and Environment Variables

- Current auth helper references plaintext-style envs: `ADMIN_PASSWORD` detected.
- Requested secure envs not fully implemented: `ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH`, `ADMIN_SESSION_SECRET`.
- Existing env constants include image, OpenRouter, Supabase, and pipeline settings in `scripts/lib/constants.mjs` (9965 bytes).
- Security risk: current password comparison must be replaced with hash verification, CSRF protection, rate limiting/logging, and stronger session secret naming.

## Deployment Platform Assumptions

- `vercel.json` exists and declares Astro build to `dist`: yes.
- Root `api/admin/*.js` implies Vercel serverless functions rather than Astro `src/pages/api` endpoints.
- Local QA must account for Astro dev/preview and Vercel API behavior differences.

## Stale Generated Article Pages

- Article-page-published records with non-blog_engine_v4 generation version: 7; examples: `f85e45bf489f7d26`, `4f06cc9283d561e7`, `696d90100d2fd288`, `db2a5cc35016e766`, `0794f75c54f2c270`.
- Source-only/direct-link items: 475.
- Whether generated article pages are stale and need regeneration: yes, any public article not on the current generation version or carrying legacy template phrases needs classify/regenerate/brief/hide/noindex handling.

## Legacy Templates and Public Output Failures

- Why old Editor's Brief templates are still live: legacy JSON body/deck fields still contain old generated copy and article pages are rendered from those persisted fields until migration/regeneration rewrites or hides them. Matches found: 0; examples: none found.
- Why banned phrases still appear: phrase guards exist, but legacy records and fallback/presentation fields predate the current guard path. Current configured/brief phrase matches: 101; examples: `ea7c824f9474271e`, `8f979011a389995b`, `83e0fcbe0c581ad0`, `40e4460619d1f600`, `0ccf1e3f69f2b513`.
- Why low-relevance items still appear in the homepage feed: homepage eligibility currently allows records unless explicit flags such as `homepagePublished=false`, `archiveOnly=true`, hidden tier, or quarantined status are set. Low-relevance homepage examples: 5; examples: `028858f9156b3255`, `43bfb1d4d4b67121`, `1a96668b50f090e9`, `af44c4d440e3d001`, `fb34dcf560cea3c6`.
- Why images are not reliably visible per article: display code supports multiple legacy fields and local fallbacks, but not every eligible record has a generated/fallback asset that exists on disk. Missing image examples: none found.
- Clipped extraction fragments detected in persisted public copy: 1; examples: `3c9d4e08c978770c`.

## Safe Admin Implementation Location

- Where admin should be implemented safely: extend `src/pages/admin/` for noindexed private shells and root `api/admin/` for Vercel-protected APIs, using shared auth/session/CSRF middleware in `api/admin/_auth.js` or a replacement module.
- Admin must remain excluded by `astro.config.mjs` sitemap filter and `src/pages/robots.txt.ts`, and private data must only load after authenticated API calls.
- File-backed CMS writes should go through the existing GitHub-backed store pattern in `api/admin/_github.js`, with conflict handling, audit log writes, and post-save artifact regeneration.
