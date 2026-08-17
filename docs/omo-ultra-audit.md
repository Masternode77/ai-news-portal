# OMO Ultra Current State Audit

Generated from the current working tree; rerunning with unchanged inputs produces the same report.

> **Historical snapshot — non-operational.** Earlier OMO audit versions named a public dashboard, plaintext admin configuration, and a hardcoded feed list. Those claims are retained only as retired historical context and are not current operator guidance.

## Dirty Worktree Warning

Audit output omits `git status` so running this writer cannot make its own report change. Preserve unrelated worktree changes during review.

## Framework and Routing System

- Framework: Astro is declared by `package.json` dependencies and configured in `astro.config.mjs`.
- Routing: filesystem routes under `src/pages/`; detected homepage=true, article=true, adminEdit=true, adminDashboard=true, rss=true, sitemap=true.
- Retired public dashboard route is absent: true.
- Sitemap filter excludes admin/dashboard/noindex paths: yes.

## Homepage Renderer

- Renderer: `src/pages/index.astro` imports latest/archive JSON and calls `buildHomepageFeed(..., { limit: 50, minimumVisible: 30 })`.
- Current homepage source contains public nav/feed language, but still depends on generated card copy from `scripts/lib/homepage-feed-builder.mjs`.
- Current public homepage cards after product-fit and source-rights gates: 15. Retained JSON records are not treated as reader-visible cards.
- Evidence: `LatestAnalysisFeed` is the active feed component.

## Article Detail Renderer

- Renderer: `src/pages/news/[id].astro` builds static paths from latest/archive JSON and filters with `isPublicLongformArticle`.
- It uses `ArticleHeader`, `LongformArticleBody`, `SourceAttribution`, `AIDisclosureFooter`, and related cards.
- Internal metadata is partially guarded by `guardPublicCopy`, `cleanArticleBodyBlocks`, and `forbiddenPublicPhraseMatches`.
- Evidence: route source length 6086 bytes.

## Article Data Store

- Primary public data: `src/data/latest-news.json` (35 records).
- Archive data: `src/data/archived-news.json` (915 records).
- Adjacent stores: `src/data/search-index.json`, `src/data/taxonomy-pages.json`, `src/data/editorial-cycles.json`, `src/data/claim-ledger.json`, `src/data/source-health.json`.
- The data model is still legacy-compatible JSON rather than one explicit public article contract.

## Crawler and Feed Sources

- Feed registry: `config/sourceRegistry.yml` contains 28 registered sources; `activeRegistryFeeds()` currently returns 1 authorized feeds.
- Fetcher: `scripts/lib/fetch-feeds.mjs` parses RSS/Atom into `news-pool.json` through `parseFeedItem()`.
- Source acquisition fails closed: a source requires approved text rights, HTTPS terms, and a review no older than 365 days. With zero authorized feeds, `fetchNewsPoolResult()` returns `no_authorized_sources` and the pipeline exits without publication.
- Source selection and curation flow through `scripts/lib/curate.mjs`, `source-priority-policy.mjs`, and relevance routers.

## Content Generation Pipeline

- Entrypoint: `scripts/pipeline.mjs`.
- Pipeline imports extraction/relevance/repetition/expert-insight/image gates: yes.
- Generation modules live under `scripts/lib/`, with additional editorial rules in `scripts/lib/AGENTS.override.md`.
- Final public publication integrity is implemented in `scripts/lib/final-publication-integrity.mjs`: `finalPublicationIntegrityResult()` evaluates current source rights, extraction QA, detail quality, source fidelity, unsupported claims, repetition, and copyright; `enforceFinalPublicationIntegrity()` quarantines failed records. Detected: yes.

## Current Image Handling

- Current provider default: `IMAGE_PROVIDER=image2`, `OPENAI_IMAGE_MODEL=gpt-image-2`.
- Provider registry files: `chatgpt-oauth-runtime 2.mjs`, `chatgpt-oauth-runtime.mjs`, `gemini 2.mjs`, `gemini.mjs`, `index 2.mjs`, `index.mjs`, `openai-image-api 2.mjs`, `openai-image-api.mjs`, `shared 2.mjs`, `shared.mjs`.
- Duplicate provider files needing cleanup decision: `chatgpt-oauth-runtime 2.mjs`, `gemini 2.mjs`, `index 2.mjs`, `openai-image-api 2.mjs`, `shared 2.mjs`.
- Public generated assets directory: `public/generated/`.
- Current public homepage cards missing a reachable display image or fallback: 0; examples: none found.

## Publish Cron and Build Scripts

- Build: `npm run prepare:static-images && astro build`.
- Main pipeline script: `node ./scripts/pipeline.mjs`.
- Content gate: `npm run check && npm run build && node --test tests/public-output.test.mjs tests/image-output.test.mjs tests/admin-security.test.mjs tests/content-cycle.test.mjs && npm run audit:public && npm run audit:images && npm run audit:admin`.
- GitHub scheduled workflow expected at `.github/workflows/update-news.yml`: present.

## Cache and Purge Mechanism

- Cache purge scripts present: `scripts/purge-public-cache.mjs`=true, `scripts/purge-deployment-cache.mjs`=true.
- Purge uses env-gated hooks and writes reports; live purge must not be claimed unless credentials and HTTP response are captured.

## Current Admin and Dashboard Routes

- Admin edit route: `src/pages/admin/edit.astro`=true.
- Existing admin/serverless APIs: `api/admin/login.js`, `api/admin/article.js`, `api/admin/_auth.js`, `api/admin/_github.js`.
- Authenticated admin dashboard shell: `src/pages/admin/dashboard.astro`=true; it is separate from the retired public dashboard.
- Current admin routes use authenticated API calls rather than a public operations surface.

## Authentication and Environment Variables

- The legacy plaintext `ADMIN_PASSWORD` contract is not active: authentication requires `ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH`, and `ADMIN_SESSION_SECRET`=true.
- Implemented admin controls: structured scrypt password hashes use timing-safe verification; validated session secrets sign HttpOnly, SameSite=Strict cookies; mutating requests require CSRF; local failed-login throttling and audit logging are present.
- Remaining external production dependency: login fails closed until a distributed Vercel Firewall rate-limit rule is published, tested, and attested with `ADMIN_VERCEL_RATE_LIMIT_READY=true`.
- Existing env constants include image, OpenRouter, Supabase, and pipeline settings in `scripts/lib/constants.mjs` (10649 bytes).

## Deployment Platform Assumptions

- `vercel.json` exists and declares Astro build to `dist`: yes.
- Root `api/admin/*.js` implies Vercel serverless functions rather than Astro `src/pages/api` endpoints.
- Local QA must account for Astro dev/preview and Vercel API behavior differences.

## Stale Generated Article Pages

- Retained records marked article-page-published with non-blog_engine_v4 generation version: 5; examples: `eia-data-center-load-timing`, `eia-server-cooling-forecast`, `eia-virginia-peak-load`, `eia-nuclear-data-center-contracts`, `eia-texas-large-loads`. Current public detail eligibility separately requires product fit, source rights, and final publication integrity.
- Retained source-only/direct-link items: 945.
- Whether generated article pages are stale is a review question, not an editor regeneration command. The generic editor exposes `save-draft`, `publish`, `hide`, `noindex`, `upload-image`, `preview`; regeneration controls detected: none.

## Legacy Templates and Public Output Failures

- Retained JSON records with old Editor's Brief template text: 0; examples: none found. Current public homepage-card matches: 0; retained records are not current public output without product fit and source rights.
- Retained JSON records with configured/brief phrase matches: 58; examples: `01b8b1d203605f0e`, `028858f9156b3255`, `watch_sig_280ee67ee0e4b1f5`, `watch_sig_3aafa5f53fed9710`, `ea7c824f9474271e`. Current public homepage-card matches: 0.
- Current public homepage cards failing the product-fit boundary: 0. `buildHomepageFeed()` applies product fit and current source-text authorization before decoration, so retained low-relevance records are not treated as live homepage output.
- Current public homepage cards missing a display image or fallback: 0; examples: none found.
- Retained JSON clipped-extraction markers: 0; current public homepage-card matches: 0.

## Safe Admin Implementation Location

- Where admin should be implemented safely: extend `src/pages/admin/` for noindexed private shells and root `api/admin/` for Vercel-protected APIs, using shared auth/session/CSRF middleware in `api/admin/_auth.js` or a replacement module.
- Admin must remain excluded by `astro.config.mjs` sitemap filter and `src/pages/robots.txt.ts`, and private data must only load after authenticated API calls.
- File-backed CMS writes should go through the existing GitHub-backed store pattern in `api/admin/_github.js`, with conflict handling and audit log writes. The generic editor updates existing fields; it does not regenerate article, brief, or image content.
