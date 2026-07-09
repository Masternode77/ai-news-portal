# Compute Current Homepage Refresh Plan

## Status

Historical planning artifact. The homepage refresh implementation was completed after this plan; this file records the original investigation, decisions, and validation shape.

Intent is clear: refresh the public homepage and archive surfaces so Compute Current reads like a premium AI infrastructure intelligence publication, while preserving the existing static Astro feed and content pipeline.

## Baseline Evidence From Planning

- GitHub remote checked: `https://github.com/Masternode77/ai-news-portal`, default branch `main`, public repository, latest remote push observed through `gh repo view`.
- Live homepage checked at `https://www.computecurrent.com/`.
- Live HTML currently contains: `Infrastructure command center`, `public operating board`, `ChatGPT Image2 visual`, `Why it matters`, `compact signal`, and `Latest Signals`.
- Live HTML still renders a deep feed: 98 `article-list-card` mentions and 50 image provenance markers, so the issue is not feed absence. The issue is public positioning, repeated card language, and exposed internal/provenance wording.
- Local worktree already had unrelated dirty files before this plan; implementation must not overwrite them.

## Current Topology

| Area | Files | Finding |
| --- | --- | --- |
| Homepage route | `src/pages/index.astro` | Builds the homepage from `latest-news.json` and `archived-news.json` through `buildHomepageFeed()`. Contains the public-copy problems: `Infrastructure command center`, `public operating board`, `Infrastructure Intelligence Desk`, `Market read`, `Latest Signals`, `Source Trail`, `Pipeline sources`, and internal-sounding CTAs. |
| Archive routes | `src/pages/archive/index.astro`, `src/pages/archive/[page].astro` | Use `buildArchiveFeed()` and `LatestAnalysisFeed`. The list-style archive is present, but headings are generic and should align with the publication voice. |
| Feed component | `src/components/LatestAnalysisFeed.astro` | Renders feed sections and maps every item to `ArticleCard`. This is the right place to keep a normal publication feed visible without changing ingestion. |
| Card component | `src/components/ArticleCard.astro` | Shows source/date/category and renders `ArticleCardImage`. It hard-codes visible `Why it matters:` and falls back to `ChatGPT Image2 visual`. |
| Featured card | `src/components/FeaturedArticle.astro` | Uses the same visible `Why it matters:` and `ChatGPT Image2 visual` defaults. |
| Image provenance | `src/components/ArticleCardImage.astro`, `scripts/lib/article-image-surface.mjs` | Provenance is real data, but the visible label currently reads like an implementation note. Keep provenance in data/policy; replace public-facing wording. |
| Homepage feed builder | `scripts/lib/homepage-feed-builder.mjs` | Existing feed logic already supports a healthy publication list: `limit: 50`, `minimumVisible: 30`, first-viewport axis diversity, detail/source links, and public eligibility filters. Do not replace this pipeline. |
| Archive feed builder | `scripts/lib/archive-feed-builder.mjs` | Wraps `buildHomepageFeed()` for paginated archive pages. Card-copy changes will propagate to archive. |
| Repeated summaries | `scripts/lib/card-copy-quality-gate.mjs` | Main source of repeated boilerplate. It still has the banned fallback: `gives infrastructure readers a compact signal on AI capacity planning, supplier timing, or operating risk`, plus repeated `Why it matters:` templates. |
| Presentation layer | `scripts/lib/public-presentation.mjs` | Merges persisted article fields with generated card copy and image metadata. Good boundary for public presentation fixes without altering ingestion. |
| Site config | `src/config/site.ts` | Current CTAs include `Open the Signal Board`, `Trace the Methodology`, and `Send a Source Signal`, which reinforce an internal dashboard tone. |
| RSS | `src/pages/rss.xml.ts`, `scripts/lib/rss-builder.mjs` | RSS descriptions use `generateCardCopy()`, so card-copy changes affect RSS. Validate it, but no route change is expected. |
| Sitemap | `src/pages/sitemap.xml.ts`, `scripts/lib/sitemap-builder.mjs`, `astro.config.mjs` | Static routes already include `/`, `/archive/`, RSS and article pages are separate. Copy/layout changes should not require sitemap changes. If routes are added or removed, update static pages and canonical handling. |
| Public-copy guards | `config/bannedPhrases.yml`, `config/editorial/internal-public-banned-phrases.json`, `scripts/lib/internal-language-guard.mjs`, `scripts/audit-public-copy.mjs`, `scripts/audit-public-homepage.mjs` | Existing guards catch older internal terms but not all current public-facing issues. Expand guard coverage during implementation. |
| Tests | `tests/public-homepage-regression.test.mjs`, `tests/homepage-premium-surface.test.mjs`, `tests/homepage-layout.test.mjs`, `tests/card-copy-quality-gate.test.mjs`, `tests/rss-builder.test.mjs`, `tests/sitemap-builder.test.mjs`, `tests/public-image-display.test.mjs` | Tests currently preserve some old labels, so implementation should update tests first to define the new publication surface. |

## Decisions

1. Keep the existing Astro/static JSON publication architecture.
   - Reason: `buildHomepageFeed()` already provides enough visible cards and axis diversity.
   - Do not touch ingestion, extraction, curation, or article generation unless validation proves a presentation-layer fix cannot solve it.

2. Treat this as a presentation and editorial-copy change, not a pipeline rebuild.
   - Primary files should be `src/pages`, `src/components`, `src/config/site.ts`, style files, public-copy guards, and card-copy generation.
   - Avoid regenerating `src/data/*.json` and `public/dashboard-data.json` as part of the homepage refresh.

3. Keep source/date/category visible; remove internal scoring and pipeline language from public surfaces.
   - Keep useful provenance, but do not show `ChatGPT Image2 visual` as a card badge on the homepage.
   - Preferred public wording: `Editorial visual`, `Source image`, or no badge on compact cards, with full provenance left to article/policy surfaces.

4. Preserve a normal list-style publication feed.
   - Homepage should keep at least 30 recent cards when eligible inventory exists.
   - The first screen may have a lead story, but the list feed must remain prominent and visible soon below the hero.

5. Make every generated card summary angle-specific.
   - Required axes: power, grid, data center capacity, silicon supply, cooling, cloud capacity, policy, capital.
   - Do not reuse the `compact signal` fallback.
   - Do not render a repeated `Why it matters:` label on every card.

## Scope In

- Rewrite homepage hero, lead module, section headings, CTA labels, and archive headings in a public publication voice.
- Replace internal terms: `Infrastructure command center`, `public operating board`, `Signal Board`, `Source Signal`, `Pipeline sources`, visible `ChatGPT Image2 visual`, and repeated `Latest Signals` framing.
- Update `ArticleCard` and `FeaturedArticle` so cards read like edited article summaries.
- Update `card-copy-quality-gate` templates so fallback decks and takeaways are varied and tied to article angle.
- Expand public-copy guard tests and banned phrase inventory.
- Improve spacing, hierarchy, image presentation, and mobile behavior using existing CSS.
- Validate RSS and sitemap side effects.

## Scope Out

- No new production dependencies.
- No redesign into a marketing landing page.
- No change to the core ingestion/extraction/curation pipeline unless a presentation-only fix fails.
- No removal of source/date/category context.
- No publishing of internal scoring, cycle status, generation version, blueprint, qualifying-signal, deskwork, or pipeline terms.
- No cache purge or production deployment inside this planning task.

## Recommended Public Copy Direction

Use these as implementation defaults unless a later editorial pass chooses tighter wording:

- Hero eyebrow: `AI Infrastructure Intelligence`
- Hero lead: `Compute Current tracks the bottlenecks behind the AI buildout: power access, data center capacity, accelerator supply, cooling design, cloud demand, policy, and capital flows.`
- Hero support: `Source-linked reporting and analysis for readers who need to understand what changes build schedules, procurement plans, and infrastructure risk.`
- Primary CTA: `Read the latest`
- Secondary CTAs: `Browse the archive`, `How we source`, `Editorial policy`
- Lead module kicker: `Lead analysis`
- Lead module headline: use the current lead article title, not a generic command-center headline.
- Lead CTA: `Read the lead`
- Feed eyebrow: `Recent intelligence`
- Feed title: `Latest Analysis`
- Feed deck: `Source-linked reads on power, capacity, chips, cooling, cloud demand, policy, and capital.`
- Archive h1: `Publication archive`
- Archive lede: `Recent analysis and briefs from Compute Current, organized by source, date, category, and infrastructure theme.`
- Image provenance public labels: `Source image`, `Editorial visual`, or hidden on compact cards when the article already has sufficient metadata.

## Implementation Checklist

1. Lock the public-copy regression tests first.
   - Update homepage regression tests to fail on `Infrastructure command center`, `public operating board`, `compact signal`, `Pipeline sources`, visible `ChatGPT Image2 visual`, generic `Signal Board`, and repeated visible `Why it matters:` card labels.
   - Add RSS/card-copy assertions for the same phrases.

2. Refresh homepage copy and CTA labels.
   - Edit `src/pages/index.astro` and `src/config/site.ts`.
   - Replace internal dashboard language with the publication copy above.
   - Keep the existing feed builder call and card count behavior.

3. Normalize archive/listing language.
   - Edit `src/pages/archive/index.astro`, `src/pages/archive/[page].astro`, and defaults in `src/components/LatestAnalysisFeed.astro` if needed.
   - Keep pagination and canonical paths unchanged.

4. Repair card and featured-story presentation.
   - Edit `src/components/ArticleCard.astro` and `src/components/FeaturedArticle.astro`.
   - Remove the hard-coded visible `Why it matters:` label.
   - Replace visible `ChatGPT Image2 visual` fallback with premium public wording or hide the badge on compact cards.
   - Preserve accessible image alt text, source/date/category, detail/source links, and reader-impact pills when useful.

5. Replace repeated generated summary templates.
   - Edit `scripts/lib/card-copy-quality-gate.mjs`.
   - Remove the `compact signal` fallback.
   - Generate angle-specific deck/takeaway variants for power, grid, capacity, silicon, cooling, cloud, policy, and capital.
   - Make generated copy sentence-like and source-tied, not template-heading-like.

6. Tighten guardrails.
   - Update `config/bannedPhrases.yml` and `config/editorial/internal-public-banned-phrases.json`.
   - Update `scripts/lib/internal-language-guard.mjs` replacements only if the sanitizer needs better public replacements.
   - Keep banned phrase source canonical rather than scattering hard-coded checks.

7. Polish layout and responsiveness.
   - Use existing styles in `src/styles/global.css`, `src/styles/public-intelligence.css`, and `src/styles/redesign.css`.
   - Improve hierarchy and spacing for desktop and mobile.
   - Keep fixed-format card/image dimensions stable so labels and images do not resize the feed.

8. Validate RSS, sitemap, and cache implications.
   - No sitemap change is expected if routes remain unchanged.
   - RSS descriptions will change through `generateCardCopy()`, so run RSS tests and inspect `dist/rss.xml`.
   - If this later deploys to Vercel, purge cache only after a successful deployment and screenshot verification.

## Likely Files To Change During Implementation

- `src/pages/index.astro`
- `src/pages/archive/index.astro`
- `src/pages/archive/[page].astro`
- `src/components/LatestAnalysisFeed.astro`
- `src/components/ArticleCard.astro`
- `src/components/FeaturedArticle.astro`
- `src/components/ArticleCardImage.astro`
- `src/config/site.ts`
- `src/styles/global.css`
- `src/styles/public-intelligence.css`
- `src/styles/redesign.css`
- `scripts/lib/card-copy-quality-gate.mjs`
- `scripts/lib/public-presentation.mjs`
- `scripts/lib/article-image-surface.mjs`
- `scripts/lib/internal-language-guard.mjs`
- `config/bannedPhrases.yml`
- `config/editorial/internal-public-banned-phrases.json`
- `tests/public-homepage-regression.test.mjs`
- `tests/homepage-premium-surface.test.mjs`
- `tests/homepage-layout.test.mjs`
- `tests/card-copy-quality-gate.test.mjs`
- `tests/rss-builder.test.mjs`
- `tests/sitemap-builder.test.mjs`
- `tests/public-image-display.test.mjs`

Plan artifacts changed by this planning task:

- `plans/compute-current-homepage-refresh.md`
- `.omo/plans/compute-current-homepage-refresh.md`
- `.omo/drafts/compute-current-homepage-refresh.md`

## Validation Plan

Run targeted tests before full validation:

```bash
node --test tests/public-homepage-regression.test.mjs tests/homepage-premium-surface.test.mjs tests/homepage-layout.test.mjs tests/card-copy-quality-gate.test.mjs tests/rss-builder.test.mjs tests/sitemap-builder.test.mjs tests/public-image-display.test.mjs
```

Run project checks:

```bash
npm run check
npm run build
npm run test
```

Run public audits:

```bash
npm run audit:public-copy
npm run audit:homepage
npm run audit:public
npm run audit:public-images
npm run audit:feed-volume
```

Route smoke test after build:

```bash
npx astro preview --host 127.0.0.1 --port 4321
curl -I http://127.0.0.1:4321/
curl -I http://127.0.0.1:4321/archive/
curl -I http://127.0.0.1:4321/rss.xml
curl -I http://127.0.0.1:4321/sitemap.xml
```

Public-copy audit after build:

```bash
rg -n "Infrastructure command center|public operating board|ChatGPT Image2 visual|compact signal|Pipeline sources|Signal Board|Source Signal|deskwork|qualifying signal|cycle status|generation version|blueprint" dist src/pages src/components scripts/lib config tests
```

Visual QA:

- Capture desktop and mobile screenshots of `/` and `/archive/`.
- Confirm hero reads as a publication, not an operating dashboard.
- Confirm at least 30 homepage cards are visible when eligible content exists.
- Confirm card images render and compact cards do not show implementation labels.
- Confirm source/date/category metadata remains visible.
- Confirm text does not overlap on mobile.

Existing visual scripts to consider after implementation:

```bash
npm run qa:visual:commercial
npm run qa:visual:smoke
npm run qa:visual:status
```

## Risks

- `buildHomepageFeed()` feeds both homepage and archive; card-copy changes will affect archive and RSS.
- Some repeated generic phrases are embedded in data JSON and search index fields. Prefer presentation-layer cleanup first; do not regenerate or rewrite data unless unavoidable.
- Removing visible `ChatGPT Image2 visual` must not erase provenance obligations from article detail, editorial policy, or metadata.
- Existing tests currently expect old public labels such as `Latest Signals`; tests must be updated intentionally rather than patched around failures.
- The worktree has unrelated modified files. Implementation should isolate changed files and stage only intended files.
- `npm run build` may regenerate assets or `public/dashboard-data.json`; verify diffs before committing.
- CDN/Vercel cache can keep stale public HTML after deployment; purge only after successful deploy verification.

## Rollback Plan

- Keep implementation in one focused branch and one or two reviewable commits.
- If the refresh misfires, revert the homepage/card-copy commit and redeploy the previous Vercel build.
- If RSS/card summaries cause unexpected downstream effects, revert `scripts/lib/card-copy-quality-gate.mjs` and card component changes first; route files can be kept if they are independently safe.
- If cache was purged, no code rollback is needed for the purge itself; redeploy the last known good deployment.

## Success Criteria

- Homepage and archive no longer expose internal dashboard/workflow/generation language.
- Homepage still shows a live-feeling publication feed with enough recent article cards.
- Card summaries vary by article angle and do not reuse the banned compact-signal fallback.
- Source/date/category remain visible and useful.
- Images render on homepage cards and article/lead surfaces without public implementation-label badges.
- RSS and sitemap still build successfully.
- Lint/type/build/tests/audits pass, and desktop/mobile screenshots confirm the premium publication direction.
