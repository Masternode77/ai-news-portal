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

- **Nano Banana image flow**
  - If `GEMINI_API_KEY` is present, the pipeline requests article art from Gemini image generation
  - Default model is `gemini-2.5-flash-image` ("Nano Banana")
  - If the API key is missing or image generation fails, the pipeline first attempts to build a local poster from the crawled source image and then falls back to a premium SVG placeholder
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
- `GEMINI_API_KEY` *(optional)*: enables Gemini / Nano Banana image generation
- `GEMINI_IMAGE_MODEL` *(optional)*: defaults to `gemini-2.5-flash-image`

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
