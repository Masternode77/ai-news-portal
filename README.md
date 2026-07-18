# AI / Data Center Signal Board

Production-ready Astro portal for curated AI, data center, semiconductor, power, and cloud infrastructure intelligence.

## What changed in this update

- **Homepage refresh without changing the core format**
  - Keeps the same hero + masonry/news board structure
  - Upgrades the UI to a more premium glass / monochrome editorial dashboard
  - Stronger hierarchy for title, summary, expert lens, category, region, and source

- **State-aware 8-hour publishing pipeline**
  - Pulls up to **30 RSS candidates per run**
  - Creates a **daily plan of 6 curated stories**
  - Publishes exactly **2 stories every 8 hours**
  - Stores the day plan in state so later runs do not lose the curated set

- **Optional LLM curation and expert insight generation**
  - If `OPENROUTER_API_KEY` is present, the pipeline uses OpenRouter with `openai/gpt-5.3-codex`
  - The model can:
    - pick the strongest 6 stories for the day
    - generate a sharper 1-2 line summary
    - write an operator / investor / infrastructure expert insight
    - produce tags, region, category, and an image prompt
  - If no key is set, the pipeline falls back to deterministic ranking and heuristic enrichment

- **Latest-3 Korean Expert Lens**
  - Only the most recent **3 live articles** get an `Expert Lens` section
  - The section is generated in natural Korean
  - Primary model wiring is exposed via `EXPERT_LENS_MODEL` so a GPT-5.4-class model can be used at the integration point
  - If the model is unavailable, the repo falls back to a deterministic Korean expert-summary path

- **Source-first Image2 provider flow**
  - Source artwork is used when the publisher supplies a valid image; otherwise the default `IMAGE_PROVIDER=image2` creates the article visual
  - `forceAiImage` explicitly moves Image2 ahead of source artwork for controlled regeneration jobs
  - `IMAGE_PROVIDER=chatgpt` and `IMAGE_PROVIDER=openai-api` remain legacy adapters
  - `IMAGE_PROVIDER=legacy-gemini` keeps the old Gemini / Nano Banana path available but deprecated
  - If both source artwork and remote generation are unavailable, the pipeline writes bounded local raster variants
  - External image hotlinking is avoided for published cards

- **30-item live surface + archive search**
  - The homepage keeps only the latest **30** articles on the live surface
  - Older articles are moved into `src/data/archived-news.json`
  - If Supabase credentials are configured, older articles are also upserted into a Supabase archive table
  - `src/data/search-index.json` merges live + archived content for client-side search

- **Optional Telegram preview notification**
  - After build, GitHub Actions can render `index.html` with Playwright
  - The generated homepage screenshot can be sent to Telegram when bot credentials are configured

## Project structure

```text
.
├── .github/workflows/update-news.yml
├── public/generated/
├── scripts/
│   ├── capture-homepage.mjs
│   ├── pipeline.mjs
│   ├── send-telegram-photo.mjs
│   ├── lib/
│   │   ├── constants.mjs
│   │   ├── content.mjs
│   │   ├── curate.mjs
│   │   ├── fetch-feeds.mjs
│   │   ├── image-generator.mjs
│   │   ├── image-providers/
│   │   ├── normalize.mjs
│   │   ├── openrouter.mjs
│   │   ├── rank.mjs
│   │   ├── source-fetch.mjs
│   │   └── state-store.mjs
│   └── state/pipeline-state.json
├── src/
│   ├── data/
│   ├── layouts/Layout.astro
│   ├── pages/index.astro
│   └── styles/global.css
└── vercel.json
```

## Local run

```bash
npm install
PIPELINE_USE_EXISTING_POOL=1 npm run pipeline
npm run check
npm run build
npm run dev
```

## Environment variables

### Content + curation
- `OPENROUTER_API_KEY` *(optional)*: enables GPT-5.3-Codex curation and article enrichment
- `OPENROUTER_MODEL` *(optional)*: defaults to `openai/gpt-5.3-codex`
- `OPENROUTER_SITE_URL` *(optional)*: app attribution header
- `OPENROUTER_APP_TITLE` *(optional)*: app attribution header
- `EXPERT_LENS_MODEL` *(optional)*: preferred GPT-5.4-class model id for latest-3 Korean Expert Lens generation
- `EXPERT_LENS_FALLBACK_MODEL` *(optional)*: backup model id if the preferred lens model is unavailable

### Image generation
- `IMAGE_PROVIDER` *(optional)*: defaults to `image2`
  - `image2`: canonical OpenAI Image2 provider with bounded local fallback variants
  - `chatgpt`: legacy ChatGPT/OpenAI OAuth-backed runtime adapter
  - `openai-api`: legacy direct OpenAI API-key adapter
  - `local`: skip remote generation and build local source-image posters when possible
  - `legacy-gemini`: deprecated Gemini / Nano Banana provider
- `CHATGPT_IMAGE_OAUTH_ENDPOINT` *(for `IMAGE_PROVIDER=chatgpt`)*: callable image runtime endpoint
- `CHATGPT_IMAGE_OAUTH_ACCESS_TOKEN` *(for `IMAGE_PROVIDER=chatgpt`)*: OAuth access token for the runtime endpoint
- `OPENAI_API_KEY` *(for `IMAGE_PROVIDER=image2` or `openai-api`)*: OpenAI API-key auth and API billing
- `OPENAI_IMAGE_MODEL` *(optional)*: defaults to `gpt-image-2`
- `IMAGE2_HERO_SIZE` *(optional for `image2`)*: defaults to `1536x864`
- `IMAGE2_OUTPUT_FORMAT` *(optional for `image2`)*: defaults to `webp`
- `OPENAI_IMAGE_SIZE` *(optional for legacy `chatgpt` and `openai-api`)*: defaults to `1536x1024`
- `OPENAI_IMAGE_QUALITY` *(optional)*: defaults to `medium`
- `GEMINI_API_KEY` *(legacy only)*: used only with `IMAGE_PROVIDER=legacy-gemini`
- `GEMINI_IMAGE_MODEL` *(legacy only)*: defaults to `gemini-2.5-flash-image`

The published image contract is unchanged: assets live under `public/generated/`, including canonical `/generated/articles/<slug>/` variants, and external source images are not hotlinked as published card art. Normal backfill first downloads, validates, transforms, and re-encodes publisher artwork, then tries Image2, then writes bounded local raster variants. Production editorial candidates explicitly set `forceAiImage` so newly generated publication articles use Image2 before publisher artwork; controlled regeneration jobs can opt into the same ordering.

The scheduled update workflow fixes `IMAGE_PROVIDER=image2` and maps the repository's `OPENAI_API_KEY` secret. Without that secret, Image2 fails closed to the local variant generator rather than publishing a broken URL.

### Pipeline controls
- `MAX_ITEMS_FETCHED` *(optional)*: defaults to `30`
- `DAILY_CURATION_TARGET` *(optional)*: defaults to `6`
- `ITEMS_PER_RUN` *(optional)*: defaults to `2`
- `LATEST_NEWS_LIMIT` *(optional)*: defaults to `30`
- `LATEST_EXPERT_LENS_COUNT` *(optional)*: defaults to `3`
- `REFRESH_INTERVAL_HOURS` *(optional)*: defaults to `8`
- `PIPELINE_USE_EXISTING_POOL=1` *(optional)*: validate locally from checked-in data when network access is unavailable

### Archive persistence
- `SUPABASE_URL` *(optional)*: Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` *(optional)*: service role key for archive upserts
- `SUPABASE_ARCHIVE_TABLE` *(optional)*: defaults to `archived_articles`

### Private admin CMS

The noindex admin surface uses Postgres as the production source of truth and Vercel Blob
for uploaded images. It fails closed when durable services are missing.

- `DATABASE_URL` *(required in production)*: managed Postgres connection string.
- `ADMIN_USERNAME` *(required)*: initial allowlisted user.
- `ADMIN_PASSWORD_HASH` *(required)*: Argon2id PHC hash generated by the repository helper.
- `ADMIN_SESSION_SECRET` *(required)*: random cookie-signing and HMAC secret of at least 64 bytes.
- `ADMIN_ROLE` *(optional)*: `admin` or `editor`; defaults to `admin`.
- `ADMIN_USER_ROLES` *(optional)*: JSON username-to-role allowlist.
- `ADMIN_MEDIA_PROVIDER=vercel-blob` and `BLOB_READ_WRITE_TOKEN` *(required in production)*.

Run `npm run admin:migrate` before enabling a preview login. Local development uses ignored
storage under `.cache/`; it never treats `src/data`, `public`, or `dist` as writable CMS
storage. See `docs/admin-setup.md` for provisioning and verification.

### Telegram preview
- `TELEGRAM_BOT_TOKEN` *(optional)*: Telegram bot token
- `TELEGRAM_CHAT_ID` *(optional)*: chat/channel id
- `PREVIEW_BASE_URL` *(optional)*: screenshot target URL; defaults to local preview server

## GitHub Actions automation

The workflow runs on an **8-hour KST-aligned schedule**:
- `00:05 KST`
- `08:05 KST`
- `16:05 KST`

GitHub Actions uses UTC cron expressions, so the workflow defines the UTC equivalents.

Workflow steps:
1. install dependencies
2. run the unified news pipeline
3. build the Astro site
4. commit refreshed JSON/assets to `main`
5. optionally capture homepage screenshot
6. optionally send the screenshot to Telegram

## Deploy to Vercel

1. Import the repository into Vercel
2. Astro is auto-detected via `vercel.json`
3. Set environment variables in Vercel if you want runtime image generation or future server features
4. Deploy

## Notes

- The repo intentionally remains **Astro-based** to avoid a risky framework rewrite
- The daily plan is stored in state so curated stories survive across all three daily runs
- The homepage keeps the original board format while upgrading the visual quality substantially
- `scripts/update-news.js` is now just a compatibility alias to `scripts/pipeline.mjs`
