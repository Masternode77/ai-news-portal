# Content Pipeline Map

This document maps the current content generation pipeline.

## High-Level Flow

1. `.github/workflows/update-news.yml` runs `npm run pipeline` on the 00:05, 08:05, and 16:05 KST schedules, or by manual dispatch.
2. `scripts/pipeline.mjs` reads the rights-gated registry, fetches or reuses only authorized RSS candidates, plans eligible items, applies relevance/extraction/repetition gates, and writes artifacts only when a valid path produces changes.
3. The workflow rebuilds taxonomy, runs `npm test`, then runs `npm run content:gate` (including the production build) before recording its heartbeat.
4. It commits only changed tracked artifacts back to `main`; Vercel builds from the pushed repository state.

## 1. Crawler Sources

The authoritative source inventory is `config/sourceRegistry.yml`. The retired
`scripts/lib/constants.mjs` `FEEDS` export is not the production registry.

`scripts/lib/source-registry.mjs` loads the registry and `activeRegistryFeeds()`
returns only feeds that have a safe URL, are not blocked/paywalled/extraction
failed, and pass the text-rights decision. Each source needs a non-placeholder
`text_use_basis`, HTTPS `terms_url`, current `reviewed_at`, and
`allow_text_use: true`; authorization is re-reviewed within 365 days.
`allow_image_reuse` and its image basis are separate requirements for source
image reuse.

All present registry entries remain unreviewed or disabled until an authorized
operator verifies them. In that state `activeRegistryFeeds()` returns no feeds,
`fetchNewsPoolResult()` reports `no_authorized_sources`, and the pipeline exits
without publication. Use `config/sourceRightsAttestation.template.yml` to
record an authorized review before changing registry fields; RSS availability or
public accessibility does not grant text or image rights.

The crawler is RSS/Atom based through `rss-parser` in
`scripts/lib/fetch-feeds.mjs`. `parseFeedItem()` reads title, link/guid URL, RSS
body/snippet fields, publish date, source image, region, language, and default
category. `fetchNewsPool()` deduplicates by stable article ID and normalized
title, preserves minimum per-source representation when configured, and caps
the pool at `MAX_ITEMS_FETCHED`.

## 2. Source Article Extraction Logic

Feed item extraction happens in `scripts/lib/fetch-feeds.mjs`:

- `parseFeedItem()` reads title, link/guid URL, RSS body/snippet fields, publish date, source image, region, language, and default category.
- `stableArticleId()` hashes normalized URL plus canonicalized title.
- `firstImage()` checks enclosure images, `media:content`, then the first `<img>` in feed content.
- RSS content is stripped and truncated into `snippet` and `contentText`.
- `parseFeedItem()` also attaches a preliminary infrastructure relevance score from `scripts/lib/relevance-classifier.mjs` using RSS title/snippet/body fields.

Full article excerpt extraction happens in `scripts/lib/source-fetch.mjs`:

- `fetchArticleExtraction({ url, title, fallbackSnippet, sourceRegistryId, sources, networkOptions, timeoutMs = 12000 })` delegates to `fetchAuthorizedSourceText()` after source-registry authorization. Its text, feed, and source-image requests identify as `ComputeCurrentBot/1.0` and use the configured source-host boundary.
- In offline mode, failed HTTP, failed fetch, or non-OK response, it falls back to the provided snippet and records extraction QA against that fallback.
- Source-specific adapters handle extraction/cleanup for `datacenterknowledge.com`, `bloomberg.com`, `storagereview.com`, `datacenterfrontier.com`, `semiengineering.com`, `cloud.google.com`, `techcrunch.com`, `servethehome.com`, and `datacenterpost.com`.
- It prefers adapter selectors, then `<article>`, `<main>`, and body fallbacks; strips HTML; removes common navigation, CTA, newsletter, cookie, and copyright boilerplate; truncates to a sentence boundary; and returns article text plus QA metadata.

Extraction quality is scored in `scripts/lib/quality-gate.mjs`:

- `analyzeExtractionQuality()` computes `content_length`, `boilerplate_ratio`, `title_body_similarity`, `copyright_footer_detected`, `nav_or_cta_detected`, `sentence_completion_score`, `source_domain_adapter`, and `extraction_quality_score`.
- `splitByArticleQualityGate()` marks low-score full-memo candidates as `articlePagePublished: false` with quality gate metadata. The default threshold is `ARTICLE_PAGE_QUALITY_THRESHOLD=0.8`.
- Extraction QA is a hard long-form article gate: failed extraction may become a source card, but it does not receive a generated local memo.

Generated article repetition is scored in `scripts/lib/repetition-detector.mjs` after Expert Lens generation and before archive/latest sync:

- The detector compares each generated full-memo draft against the last 50 published articles from latest plus archive stores.
- It computes repeated sentence ratio, repeated paragraph ratio, heading sequence similarity, banned phrase count, n-gram overlap, blueprint repetition, and conclusion similarity.
- It blocks publication when repeated sentence ratio is above `0.12`, any banned phrase appears more than once in the current draft plus the last 9 articles, heading sequence similarity is above `0.75` against any recent article, conclusion similarity is above `0.7`, or blueprint repetition exceeds two consecutive uses.
- Blocked repetition drafts are marked `articlePagePublished: false`, `homepagePublished: false`, `archiveOnly: true`, and retain `repetition_check` plus `repetition_block_reasons` on the article record.

## 3. Article Summarization Prompts

The article summary/enrichment prompt lives in `scripts/lib/content.mjs` inside `enrichContent()`.

The system prompt positions the model as a veteran editor covering data centers, hyperscalers, cloud infrastructure, semiconductors, power markets, and AI deployment. It requires strict JSON with:

- `summary`
- `insight`
- `category`
- `tags`
- `region`
- `imagePrompt`

Prompt constraints:

- `summary`: 1-2 sentences, 180 characters max, crisp and factual.
- `insight`: up to 2 sentences, focused on operators, investors, and capacity planners.
- Avoid phrases such as `Expert lens`, `This signal matters`, `strategic significance`, and `read-through`.
- `category` must be one of the configured categories.
- `tags` must be up to six concise lowercase tags.
- `region` should be a short market label.
- `imagePrompt` should describe a premium 16:9 editorial image with no logos or text.
- Do not invent facts or numbers unsupported by source text.

If OpenRouter is unavailable or returns invalid JSON, deterministic fallbacks are used:

- `fallbackSummary()` truncates article text, snippet, or title.
- `fallbackInsight()` infers a practical market theme from keywords.
- `fallbackImagePrompt()` builds a generic editorial image prompt.
- `normalizeAiPayload()` validates model output and falls back field-by-field.

OpenRouter wiring is in `scripts/lib/openrouter.mjs`, with `OPENROUTER_MODEL` defaulting to `openai/gpt-5.3-codex`.

## 4. Editorial Brief Prompts

The editorial brief / article body generation is implemented as the Expert Lens layer in `scripts/lib/expert-lens.mjs`, with shared newsroom voice guidance in `scripts/lib/editorial-humanizer.mjs`.

Article blueprint selection lives in `scripts/lib/article-blueprints.mjs`.

- The catalog currently defines `constraint-ledger`, `stakeholder-map`, `capacity-chain`, and `capital-operator-brief`.
- Each blueprint has distinct reader-facing section headings, paragraph rhythm, target paragraph count, and body length bounds.
- `selectArticleBlueprint()` chooses deterministically from article metadata while checking recent blueprint history.
- If the two most recent generated articles used the same blueprint, that blueprint is removed from the candidate set for the next generated article.
- The selected blueprint is persisted as `article_blueprint`, `articleBlueprint`, and `expertLensFull.blueprintId`.

`generateExpertLensFull()` calls OpenRouter through `callExpertLensText()` and asks for strict JSON with:

- `blueprintId`
- `thesis`
- `whatHappened`
- `whyThisMatters`
- `marketMissing`
- `investors`
- `operators`
- `hyperscalers`
- `watchNext`
- `executiveSummary`
- `headlineOptions`
- `finalHeadline`
- `metaDescription`
- `finalArticleBody`
- `sourceLink`

Key prompt rules:

- Write like a top-tier business technology editor covering AI, data centers, power, semiconductors, and cloud infrastructure.
- Use `EDITORIAL_HUMANIZER_PROMPT`.
- Be decision-grade, accurate, skeptical, and free of generic hype.
- Report what changed, explain why it matters now, identify 1-2 underappreciated constraints, name practical implications, and end with what to watch next.
- `executiveSummary` must be exactly three short lines: what changed, why it matters, and what to watch.
- `headlineOptions` must contain exactly five concise English headline ideas.
- `finalArticleBody` is the primary deliverable and must follow the selected blueprint's headings, paragraph rhythm, and length target.
- Do not include reader-facing headings such as `Why it matters`, `Pressure points`, `Market implications`, or `What to watch`.

`EDITORIAL_HUMANIZER_PROMPT` requires a natural newsroom voice, fact preservation, no invented numbers/quotes/motives, avoidance of consulting-memo phrasing, varied sentence length, concrete nouns, and no mention of humanization or AI detection.

If model output is missing or too templated, `fallbackExpertLensFull()` and `blueprintFallbackBody()` generate deterministic article body, executive summary, headline options, and meta description from available article fields while preserving the selected blueprint.

## 5. Taxonomy and Tag Assignment Logic

The current classification surface is hierarchical taxonomy rather than the old broad `category` field.

Taxonomy logic lives in `scripts/lib/taxonomy.mjs` and emits:

- `primary_category`
- `secondary_category`
- `infrastructure_layer`
- `affected_stakeholders`
- `article_type`
- `region`
- `urgency_score`

Deterministic assignment:

- `classifyTaxonomy()` scores source text against rules for AI infrastructure, data centers, cloud capacity, semiconductors, power/grid, cooling/facility engineering, capital markets, enterprise AI infrastructure, and policy/siting.
- It uses infrastructure relevance scores when present, then assigns a primary category, secondary subbeat, infrastructure layer, stakeholder list, article type, region, urgency score, confidence, and reasons.
- `inferRegion()` still scans against `REGION_HINTS`, falling back to the feed/default region.
- The legacy `category` field is retained as a compatibility alias for `primary_category`.
- `buildFallbackTags()` still maps keyword groups to tags such as `gpu`, `cloud`, `power`, `cooling`, `semiconductor`, `policy`, `colocation`, and `financing`.

LLM assignment:

- `enrichContent()` asks the model for taxonomy fields, tags, and region.
- `classifyTaxonomy()` validates model taxonomy labels against allowed primary categories, infrastructure layers, and article types; invalid labels fall back to deterministic taxonomy.
- Tags are combined with fallback tags, deduped, and capped at six.

Infrastructure relevance classification:

- `scripts/lib/relevance-classifier.mjs` scores each source article from 0 to 1 on direct AI infrastructure, data center, cloud capacity, semiconductor, power/grid, cooling, capital markets, and enterprise AI infrastructure relevance.
- RSS items receive a preliminary score in `fetch-feeds.mjs`; enriched items are rescored in `content.mjs` after full source extraction and editorial summary fields are available.
- `infrastructure_relevance_score >= 0.75` routes an item to the full Compute Current memo path, subject to extraction QA.
- `0.45 <= infrastructure_relevance_score < 0.75` routes an item to a short signal card only.
- `infrastructure_relevance_score < 0.45` marks an item `archiveOnly: true` and `homepagePublished: false`. The final public product-fit gate and current source-text authorization are universal public-output requirements; there is no manual approval bypass.

Expert insight extraction:

- `scripts/lib/expert-insight-engine.mjs` extracts structured decision fields from each enriched source article before long-form memo generation.
- Extracted fields are `concrete_facts`, `named_companies`, `infrastructure_layer`, `bottleneck_type`, `who_gains_leverage`, `who_takes_execution_risk`, `timing_dependency`, `counterargument`, and `next_observable_signal`.
- `enrichContent()` persists these fields as `expert_insight`, `expertInsight`, and top-level compatibility fields on the article record.
- `splitByExpertInsightGate()` blocks long-form memo generation when required fields are empty. Blocked items are converted into source/signal cards with `expertInsightBlocked`, `expertInsightBlockReason`, and missing-field metadata.
- `generateExpertLensFull()` includes the extracted insight fields in the prompt and refuses long-form generation if the fields are incomplete.
- The deterministic fallback body path also starts from the extracted facts, companies, bottleneck, leverage, execution risk, timing dependency, counterargument, and next observable signal so offline generation cannot fall back to generic infrastructure analysis.

## 6. Homepage Feed Generation

Static homepage rendering is in `src/pages/index.astro`.

Inputs:

- `src/data/latest-news.json`
- `src/data/archived-news.json`

Homepage layout logic:

- `index.astro` combines latest and archived records and calls `buildHomepageFeed(..., { limit: 50, minimumVisible: 30 })`. The limit is an upper bound: a zero or undersized authorized inventory does not manufacture cards.
- `buildHomepageFeed()` admits only an identified record that passes public product fit and current source-text authorization, is not explicitly hidden, archive-only, quarantined, or `archive_only_noindex`, and has not been marked `homepagePublished: false`.
- The builder deduplicates and sorts eligible records, then decorates them with public card copy and source/detail links. A detail link is emitted only when `isPublicLongformArticle()` passes; otherwise the eligible signal links to its safe source URL.
- Featured, visual lead, ticker, and feed sections derive from that one gated feed. Retained JSON, `src/data/search-index.json`, and the `LATEST_NEWS_LIMIT` store split are not independent homepage-publication paths.

Article detail pages are generated by `src/pages/news/[id].astro` from the same combined stores only when `isPublicLongformArticle()` passes: an ID, explicit `articlePagePublished: true`, no signal/brief/archive/quarantine/noindex exclusion, public product fit, detail-quality eligibility, and current source-text authorization are all required.

RSS generation is in `src/pages/rss.xml.ts`. `buildRssItems()` combines latest and archived records, then requires an ID, publication date, `rssItemEligible()` (core or adjacent public route with no noindex/archive exclusion), and current source-text authorization before sorting by analysis/publish time and retaining at most 100 items. Public longform receives its canonical detail URL; an eligible non-longform item uses its safe source URL.

## 7. Archive Storage

Archive management is in `scripts/lib/archive-store.mjs`.

`syncArchiveArtifacts()`:

- Merges and deduplicates all article records.
- Sorts by `publishedAt` descending.
- Splits the newest homepage-eligible `LATEST_NEWS_LIMIT` records into `latest`.
- Moves overflow records plus `archiveOnly` / `homepagePublished: false` records into archive, merged with prior archive.
- Converts latest and archive records into searchable records via `toSearchableArticle()`.
- Writes `src/data/archived-news.json`.
- Writes `src/data/search-index.json` as merged latest-searchable plus archive.
- Optionally upserts overflow archive records into Supabase.

`src/data/latest-news.json` is written by `scripts/pipeline.mjs` after `syncArchiveArtifacts()` returns the current latest set.

## 8. Publish/Deploy Hooks

Scheduled publish path:

- `.github/workflows/update-news.yml` schedules the full news pipeline at 00:05, 08:05, and 16:05 KST.
- It runs `npm run check`, `npm run pipeline`, taxonomy regeneration, `npm test`, and `npm run content:gate`; the content gate performs the production build.
- It commits and pushes changes to `main` for:
  - `src/data/latest-news.json`
  - `src/data/archived-news.json`
  - `src/data/search-index.json`
  - `src/data/news-pool.json`
  - `src/data/taxonomy-pages.json`
  - `src/data/pipeline-heartbeat.json`
  - `scripts/state/pipeline-state.json`
  - `public/generated`
- Commit message: `chore: refresh news surface and archive [skip ci]`.

Build/deploy path:

- `vercel.json` declares Astro, `npm run build`, and output directory `dist`.
- Vercel deploys from repository pushes.
- `package.json` build script runs `prepare:static-images` and `astro build`.
- `prepare-static-images` may refresh missing local generated images in latest/archive JSON before the Astro build.

Admin edit publish path:

- `api/admin/article.js` exposes authenticated GET/POST article editing.
- `api/admin/_github.js` reads/writes `src/data/latest-news.json`, `src/data/archived-news.json`, and `src/data/search-index.json` through the GitHub Contents/Git API.
- Saving an edit commits to the configured branch (`GITHUB_BRANCH`, default `main`), which lets Vercel rebuild after GitHub receives the commit.

## 9. Article Tables and JSON Stores

JSON stores:

- `src/data/news-pool.json`: latest fetched/deduped RSS candidate pool fallback, including preliminary infrastructure relevance scores.
- `src/data/latest-news.json`: live homepage surface, capped by `LATEST_NEWS_LIMIT` and excluding archive-only relevance failures.
- `src/data/archived-news.json`: overflow, archive-only, and prior articles enriched for archive/search.
- `src/data/search-index.json`: merged latest + archive records with `searchText` for client-side search.
- `scripts/state/pipeline-state.json`: pipeline state containing published IDs, day plans, slot publication markers, run history, last run time, extraction gate details, and infrastructure relevance routing details.

Database table:

- Optional Supabase table configured by `SUPABASE_ARCHIVE_TABLE`, default `archived_articles`.
- Upserted columns include `id`, `slug`, `title`, `url`, `source`, `published_at`, `summary`, `expert_lens`, `expert_lens_full`, `category`, `region`, `generated_image`, `tags`, `article_text`, and `archived_at`.
- Supabase writes are skipped when `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, or article rows are missing.

## Notes and Observed Boundaries

- The pipeline is mostly file-backed. Supabase is an optional archive sink, not the primary read path for the Astro site.
- Article detail pages are generated from checked-in JSON, not from Supabase.
- Low-quality extraction does not remove an item from the signal surface; it blocks the local article detail page and points the item to the original source URL.
- Low infrastructure relevance removes an item from the public homepage. The final public product-fit gate and current source-text authorization have no manual override; retained records are not evidence of reader-visible output.
- `scripts/update-news.js` is only a compatibility alias that imports `scripts/pipeline.mjs`.
- Expert Lens enrichment applies to focused publishable and visible records; it is not a fixed “Latest-3” contract.
