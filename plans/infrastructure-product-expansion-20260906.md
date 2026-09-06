# Infrastructure product expansion — 2026-09-06

Baseline: production v0.0.19, commit 5c28ded93c15239284ccfa063c74b8c71960cf43. Current user authorizes implementation and reflection of the requested product and operations lanes. The later scope update removes email subscription/sender integration and publisher permission-request drafts. Missing data credentials block only the affected refresh, not independent implementation.

## Deliverables and acceptance

1. Public data desk: measured grid demand (EIA-930), reported ERCOT large-load queue and EIA-860M planned generation with source URL, observation period, units, retrieved time, freshness and limitations. Never label total system demand as measured AI demand or queue applications as energized capacity. Public adapters validate upstream data and retain last verified snapshot on failure; no fabrication or build-time network dependency.
2. Korean lane: item-specific public-use eligibility, source dates, Korean titles/summaries only when commercial adaptation is allowed; otherwise link-only. No blanket KEPCO/MOTIE authorization from domain or RSS presence.
3. Hourly independent watchdog: >=12h since successful Update News run, deduplicated GitHub issue/recovery; OpenRouter monthly key usage vs explicitly configured USD cap, unknown when absent. No real alerts from unit tests.
4. Permanent region/utility/REIT hub pages and glossary using primary sources and meaningful static context, with eligible existing coverage links and empty states. Existing public rights checks unchanged.
5. Weekly digest selection/rendering as a public on-site summary and editorial JSON/HTML web artifact. No subscriber collection, sender integration or email delivery surface.
6. Ops completion: use the Codex-managed image workflow without an OpenAI API key; update verified Register/DCF feed locations without granting content rights; evidence-backed relevance evaluation rather than arbitrary threshold reduction.
7. After core implementation: improve data usability through downloadable CSV with provenance and freshness checks; fix discovered pipeline/report persistence drift and isolate optional refresh failures.

## Work and verification

- Research official sources before adapters; bound parallel research and monitoring implementation.
- Keep existing editorial design tokens and extend DESIGN.md for new routes/states.
- Implement pure parsers/selection/monitor tests with fixtures and failure cases; do not invent live metrics.
- Run relevant tests, Astro check/build, browser checks at desktop/mobile, source-fidelity/repetition/publication checks for affected editorial surfaces, and independent security/source review before deployment.
- Preserve originals, avoid new dependencies, use existing GitHub/Vercel deployment flow; record unresolved external credentials/settings explicitly.
- The monthly financial alert cap is $30. Email service/sender work and publisher request drafts were removed by the user's later scope update.
