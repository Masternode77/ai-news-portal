# Infrastructure product expansion

Baseline: Vercel production v0.0.19, commit 5c28ded93c15239284ccfa063c74b8c71960cf43. Prepared September 6, 2026.

## Implemented surfaces

- `/data/`: EIA-930 demand for ERCOT, PJM and APS; EIA-860M planned generating/storage capacity; explicitly historical April ERCOT large-load stages. Each includes source, observation/edition date, unit and CSV export. These are grid context, not measured AI demand.
- `/ko/` and `/ko/rss.xml`: four manually reviewed, item-specific KOGL-1 text summaries; older policy items marked as archive. No media reuse or blanket KEPCO permission.
- `/hubs/`, `/entities/`, `/glossary/`: three regions, five entities and twelve terms with primary-source links and related public coverage.
- `/newsletter/`: an on-site seven-day infrastructure digest. Weekly Actions preparation produces reviewable JSON/HTML web artifacts.
- Operations Monitor: independent hourly checks for 12-hour publication stagnation and monthly usage of the configured OpenRouter API key. Repository budget variable is $30; warning at $24, critical at $30. State transitions deduplicate/recover GitHub Issues; no unrequested spend shutdown.
- Updated working Register and Data Center Frontier feed URLs; both remain disabled for unlicensed text/media reuse.
- Korean infrastructure relevance calibration retains thresholds 0.75/0.55, recognizes physical infrastructure signals, and excludes weak stock/consumer chatter.

## Additional improvements implemented

CSV formula protection and source provenance; last-validated-data retention on independent upstream failures; future-edition rejection; planned month/year validation; automated weekly draft artifacts; monitor recovery without repeated issue spam; taxonomy report included in scheduled publication commits to prevent report drift.

## Activation gaps

- `EIA_API_KEY`: not present among repository Secrets; recurring hourly-demand refresh cannot authenticate. A real September 4–5 EIA research snapshot is published, not simulated current data. EIA-860M newer-workbook retrieval failed during the integration check, retaining the validated July edition.
- Korean briefs and ERCOT stage figures are reviewed snapshots, not an unrestricted automated publisher scraper.

## Verification

Integration evidence is captured outside tracked files. The final targeted expansion suite passes 41/41, the Python XLSX suite 3/3, and built-output tests 22/22. The integrated build generates 91 pages. Quality, relevance, taxonomy and repetition checks pass. Astro check reports zero errors and warnings (24 hints). Browser checks passed across 20 desktop/mobile pages with zero horizontal overflow and zero JavaScript page errors; five CSV/RSS/sitemap responses passed, as did glossary empty/match/reset states. Public output/copy/article/homepage/feed-volume audits passed. Production results are recorded in the deployment handoff.
