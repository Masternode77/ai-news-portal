# Baseline Deployment Verification

Date: 2026-05-21

## Production Deployment

- Product restore commit: `ff603711` (`Reset Compute Current to May 19 editorial baseline`)
- Vercel deployment: `dpl_DbYxCwzLLhfxE42b51utdWfwUbun`
- Deployment URL: `https://ai-news-portal-7zf0dudn7-masternode77s-projects.vercel.app`
- Status: Ready
- Target: Production
- Aliases:
  - `https://computecurrent.com`
  - `https://www.computecurrent.com`
  - `https://ai-news-portal-git-main-masternode77s-projects.vercel.app`

Vercel build logs show the deployment cloned `github.com/Masternode77/ai-news-portal` from branch `main` at commit `ff60371`.

## Build Evidence

Local verification before pushing `main`:

- `npm run test`: passed
- `npm run check`: passed
- `npm run build`: passed

Production build evidence:

- `sync:dashboard-data` completed and wrote `public/dashboard-data.json`.
- `prepare-static-images` completed with `latest=0/30 archive=0/327`.
- Astro built 772 pages.
- `rss.xml` generated.
- `sitemap-index.xml` generated.

## Runtime Checks

HTTP checks after canonical redirects:

- `https://computecurrent.com`: `200`
- `https://computecurrent.com/rss.xml`: `200`
- `https://computecurrent.com/sitemap-index.xml`: `200`

Exact invalid phrase scans returned no matches on:

- `https://www.computecurrent.com`
- `https://www.computecurrent.com/rss.xml`
- `https://www.computecurrent.com/dashboard-data.json`

Scanned phrases:

- `AWS Weekly Roundup`
- `Backfilled Analysis`
- `Evidence`
- `Verification frame`
- `Claim verification`
- `evidence anchor`
- `infrastructure lane`
- `cluster clears the desk bar`
- `frames how infrastructure teams should test`
- `launch_ready_v1`
- `editorial_article_engine_v3`
- `editorial_article_engine_v4`
- `editorial-article-engine-v3`
- `editorial-article-engine-v4`
- `Admin Debug`

## Result

Production is serving the restored May 19 editorial baseline. The post-May-19 AWS Weekly Roundup, launch-ready, editorial v3/v4, monetization, newsletter capture, source expansion, and forced local-article work is not active in the verified public runtime outputs.
