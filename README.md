# AI / Data Center Signal Board

Production-ready Astro portal for curated AI, data center, semiconductor, and cloud infrastructure news.

## What this repo does

- Dashboard-style dark homepage with:
  - Hero card + responsive masonry cards
  - Source badge, time ago, title, short summary, expert insight
  - Generated thumbnail (`public/generated/*`)
- Automated news pipeline every 8 hours:
  - Fetches up to 30 global RSS items
  - Deduplicates and ranks by recency + relevance + source diversity
  - Curates 6/day and publishes exactly 2 per run (when available)
- State-aware publishing to avoid reposting:
  - `scripts/state/pipeline-state.json`
  - `src/data/latest-news.json`
  - `src/data/news-pool.json`
- Optional Gemini image generation ("Nano Banana" concept style):
  - Uses `GEMINI_API_KEY` if present
  - Falls back to generated SVG gradient placeholders
- GitHub Actions automation and Vercel-ready deployment config

## Project structure

- `src/pages/index.astro`: homepage UI
- `src/styles/global.css`: dashboard styles
- `src/data/latest-news.json`: published feed shown on homepage
- `src/data/news-pool.json`: latest fetched candidate pool
- `scripts/pipeline.mjs`: end-to-end pipeline runner
- `scripts/lib/*`: modular fetch/rank/curate/content/image/state logic
- `scripts/state/pipeline-state.json`: publish history and day plans
- `public/generated/*`: generated/placeholder thumbnails
- `.github/workflows/update-news.yml`: 8-hour automation
- `vercel.json`: Vercel deployment settings

## Local run

```bash
npm install
npm run pipeline
npm run build
```

## Environment variables

- `GEMINI_API_KEY` (optional): enables Gemini image generation.
- `GEMINI_IMAGE_MODEL` (optional): overrides default model (`gemini-2.5-flash-image-preview`).

Without `GEMINI_API_KEY`, the pipeline writes deterministic SVG gradient placeholders to `public/generated/`.

## Automation

GitHub Actions workflow:

- Schedule: every 8 hours (`0 */8 * * *`)
- Manual: `workflow_dispatch`
- Steps: install, run pipeline, verify build, commit updated data/assets to `main`

## Deploy to Vercel

1. Import repo in Vercel.
2. Set framework preset to Astro (auto-detected).
3. Optionally configure `GEMINI_API_KEY` in project env vars.
4. Deploy.
