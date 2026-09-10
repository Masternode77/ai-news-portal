# Source expansion — AI, data center and digital infrastructure sourcing (2026-09-10)

Reviewed by: Compute Current editorial desk, from GitHub-hosted `Feed Probe` runs 5–14
(`feed-probe.yml`, pipeline user agent `ComputeCurrentBot/1.0`) and `Terms Probe` runs 17–19
(`terms-probe.yml`, browser user agent) on 2026-09-10. Every quotation below was read from the
publisher's own page on that date. This is an operator record, not legal advice; a lawyer should
confirm anything the site relies on commercially.

The brief was to find every additional medium, column or document stream about AI, data centers
and digital infrastructure that the pipeline can collect, put it on the sourcing list, and make the
rights-clean part of it usable by the wire and the authored columns. The registry
(`config/sourceRegistry.yml`) is that list; this file is the evidence behind each row.

## What changed

| Lane | Before | After |
| --- | --- | --- |
| Text-authorized feeds (`activeRegistryFeeds()`) | 9 | 22 |
| Registered sources | 37 | 76 |
| Link-only candidates (feed reachable, text rights unreviewed) | 27 legacy publishers | 27 legacy + 26 new |
| Candidates checked and left out (blocked, dead, or non-commercial licence) | — | 52 URLs, listed in section C |

Nothing in the rights gate was weakened. A source is fetched only when its registry row carries a
reviewed basis, an HTTPS `terms_url`, a `reviewed_at` inside the 365-day window and
`allow_text_use: true`; `sourceTextTargetDecision()` still refuses any article host that is not in
`article_hosts`.

## A. New text-authorized sources

| Registry id | Publisher / feed | Runner check (2026-09-10) | Rights evidence | How it is used |
| --- | --- | --- | --- | --- |
| `federal-register-ferc` | Federal Register, FERC documents — `https://www.federalregister.gov/api/v1/documents.rss?conditions%5Bagencies%5D%5B%5D=federal-energy-regulatory-commission` | 200, RSS, 133 items (30 days) | About this site: "Any person may reproduce or republish any material appearing in any regular or special edition of the Federal Register (1 CFR 2.6). There are no restrictions regarding what is reproduced, who can reproduce it, or where it can be reproduced." govinfo policies: 17 U.S.C. § 105 places works of the U.S. Government in the public domain. | Public-domain route around the Cloudflare-blocked `ferc.gov` feed (`ferc-news` stays `status: blocked`). Orders, tariff and interconnection filings, large-load notices. |
| `federal-register-doe` | Federal Register, Department of Energy documents | 200, 148 items | Same 1 CFR 2.6 permission | Formal rulemaking record ("Securing the United States Bulk-Power System", grid and loan programme notices) alongside the DOE newsroom feed. |
| `federal-register-bis` | Federal Register, Bureau of Industry and Security documents | 200, 5 items | Same | Export controls on advanced chips, AI model weights and equipment; `bis.gov` has no working feed (404). |
| `federal-register-data-center-search` | Federal Register full-text search `"data center"` | 200, 15 items | Same | Every agency's notices that mention data centers (permitting, siting, energy, procurement). The relevance gate decides which are on-beat. |
| `federal-register-ai-search` | Federal Register full-text search `"artificial intelligence"` | 200, 36 items | Same | Executive orders, agency AI guidance and compute-related rules; presidential documents land here a few days after whitehouse.gov. |
| `whitehouse-presidential-actions` | The White House — `https://www.whitehouse.gov/presidential-actions/feed/` | 200, 30 items (`/news/feed/` and `/briefings-statements/feed/` also 200; `/feed/` is 404) | Copyright page: "Pursuant to federal law, government-produced materials appearing on this site are not copyright protected." Third-party content is CC BY 3.0 US and is not copied. | Executive orders and proclamations on AI, data center permitting, energy and export policy. Most items are off-beat and stay archive-only. |
| `nsf-news` | U.S. National Science Foundation — `https://www.nsf.gov/rss/rss_www_news.xml` | 200, 15 items; article pages 200 (`node__content` body) | 17 U.S.C. § 105 (govinfo public-domain notice). NSF's own policies page renders its copyright section client-side and `/policies/copyright` is 404, so the site statement could not be text-verified from the runner; the statutory basis is recorded in `rights_note`. robots.txt disallows `/news/releases` only. | AI Infrastructure Hubs, national research compute, quantum and materials investments. |
| `sec-press` | U.S. Securities and Exchange Commission — `https://www.sec.gov/news/pressreleases.rss` | 200, 25 items; press pages 200 (`field--name-body`) | Privacy information page, "Website Dissemination": content is "public information and may be copied or further distributed by users of the web site without the SEC's permission. Please consider appropriate citation to the SEC as the source." (Browser user agent gets 403; the pipeline user agent gets 200.) | Restored after being dropped in PR #19 as off-beat: off-beat items no longer reserve a pool slot, so the feed costs nothing when quiet and contributes when AI-claim, REIT or utility actions appear. |
| `acer-news` | ACER, EU Agency for the Cooperation of Energy Regulators — `https://www.acer.europa.eu/rss.xml` | 200, 10 items; article pages 200 (`article.node--type-news`) | Legal notice: "Information and documents made available on the Agency's webpages are public and may be reproduced and/or distributed, totally or in part, irrespective of the means and/or the formats used, for non-commercial and commercial purposes, provided that the Agency is always acknowledged as the source of the material." | EU adequacy assessments, data centre demand versus supply (Portugal, 2026-09-07), capacity calculation and flexibility rules. The feed ships an escaped anchor tag as each link and Drupal dates; `fetch-feeds.mjs` repairs both. |
| `arxiv-cs-dc` | arXiv cs.DC — `https://rss.arxiv.org/rss/cs.DC` | 200, 24 items/day; abstract pages 200 (`blockquote.abstract`) | API terms of use: "You are free to use descriptive metadata about arXiv e-prints under the terms of the Creative Commons Universal (CC0 1.0) Public Domain Declaration." E-prints stay under the authors' licences ("We encourage you to link to the abstract page"; do not store or serve e-prints). robots.txt allows `/abs/` with `Crawl-delay: 15`; the pipeline enriches at most two items per run, sequentially. | Abstract-level research briefs on GPU cluster scheduling, datacenter networking, large-scale training systems. Items link to the abstract page, never the PDF. |
| `arxiv-cs-ar` | arXiv cs.AR (hardware architecture) | 200, 20 items/day | Same | Accelerators, HBM and memory systems, interconnects, inference silicon. |
| `arxiv-cs-pf` | arXiv cs.PF (performance) | 200, 7 items/day | Same | Inference efficiency, energy-aware scheduling, cache and memory modelling. |
| `ec-press-corner` | European Commission press corner — `https://ec.europa.eu/commission/presscorner/api/rss?language=en` | 200, 10 items (the feed only ever lists the latest 10; three runs a day cover the daily volume). Detail pages are an Angular shell (`<app-root>` only, 22 KB); the same-host documents API `presscorner/api/documents?reference=IP%2F26%2F1799&language=en` returns JSON with `docuLanguageResource.htmlContent` (Terms Probe run 21). | Legal notice: "Unless otherwise indicated (e.g. in individual copyright notices), content owned by the EU on this website is licensed under the Creative Commons Attribution 4.0 International (CC BY 4.0) licence. This means that reuse is allowed, provided appropriate credit is given and changes are indicated." (Commission Decision 2011/833/EU.) The feed's `<copyright>` element names DG COMM as the owner. | Press releases, Q&As and speeches on the AI Continent Action Plan, gigafactories, the Cloud and AI Development Act, grids and chips. `source-fetch.mjs` rewrites the detail URL to the API reference (`ip_26_1799` → `IP/26/1799`) and extracts the returned HTML. |

## B. New link-only candidates (feed reachable, text rights unreviewed)

Registered with `text_use_basis: unreviewed` and `allow_text_use: false`, so `activeRegistryFeeds()`
never fetches them. They are on the list so an operator can read the terms, record a basis and flip
the row; the verdict column uses the same key as `docs/source-rights-review.md`.

| Registry id | Publisher | Feed (runner) | Terms read? | Verdict |
| --- | --- | --- | --- | --- |
| `nextplatform` | The Next Platform | 200, 83 items (redirects to `?lab_viewport=rss`) | `/about-us/` 404; footer reserves all rights | Low risk — headline + link |
| `fierce-network` | Fierce Network | 200, 25 items | not yet | Low risk — headline + link |
| `light-reading` | Light Reading | 200, 50 items | Informa TechTarget terms (same as Data Center Knowledge): no data mining or robots | Low risk — headline + link |
| `network-world` | Network World | 200, 20 items, full text in feed | not yet | Low risk — headline + link |
| `eetimes` | EE Times | 200, 10 items | not yet | Low risk — headline + link |
| `techpowerup` | TechPowerUp | 200, 125 items (consumer-heavy) | not yet | Low risk — headline + link |
| `semiconductor-digest` | Semiconductor Digest | 200, 100 items, full text in feed | not yet | Low risk — headline + link |
| `ieee-spectrum-computing` | IEEE Spectrum (computing topic) | 200, 30 items | IEEE site terms reserve reproduction rights | Low risk — headline + link |
| `mit-technology-review` | MIT Technology Review | 200, 10 items | terms of service reserve all rights; paywall | Low risk — headline + link |
| `ars-technica-biz-it` | Ars Technica, Biz & IT | 200, 20 items | Condé Nast user agreement | Low risk — headline + link |
| `canary-media` | Canary Media | 200, 100 items | `/about/republishing` 404 from the runner | Ask first — the nonprofit publishes republication terms that need reading |
| `latitude-media` | Latitude Media | 200, 10 items, full text in feed | not yet | Low risk — headline + link |
| `carbon-brief` | Carbon Brief | 200, 12 items, full text in feed | not yet | Low risk — headline + link |
| `ieefa` | IEEFA | 200, 10 items | not yet | Low risk — headline + link |
| `berkeley-lab-news` | Berkeley Lab News Center | 200, 12 items | `/about/` 404; lab is run by the University of California, so releases are not automatically federal public domain | Ask first |
| `semianalysis` | SemiAnalysis | 200, 20 items, partly paywalled | Substack terms; author copyright | Low risk — headline + link |
| `interconnects` | Interconnects | 200, 7 items | Substack terms | Low risk — headline + link |
| `fabricated-knowledge` | Fabricated Knowledge | 200, 16 items | Substack terms | Low risk — headline + link |
| `latent-space` | Latent Space | 200, 12 items | Substack terms | Low risk — headline + link |
| `etnews` | 전자신문 (section 901) | 200, 30 items | not yet | Low risk — headline + link (Korean press copyright) |
| `zdnet-korea` | ZDNet Korea | 200, 29 items (FeedBurner) | not yet | Low risk — headline + link |
| `electimes` | 전기신문 | plain `http` only (50 items) | not yet | **Blocked** — the fetcher requires HTTPS |
| `thelec` | 디일렉 | 200, 50 items | not yet | Low risk — headline + link |
| `datanet` | 데이터넷 | 200, 50 items | not yet | Low risk — headline + link |
| `ofgem` | Ofgem | 200 but a single item | `/terms-and-conditions` 404 | Low value until the feed carries news; probably Crown copyright under OGL v3, unverified |
| `neso` | National Energy System Operator | 200, 10 mixed items (FOI responses, workgroup papers) | Terms prohibit commercial exploitation of site material without written permission | Ask first |

A link-only lane still does not exist in the pipeline (see `docs/source-rights-review.md`); these
rows are inventory, not publication.

## C. Checked and left out

Feeds and terms pages that failed from the runner or carry a licence the site cannot use. None of
these are in the registry.

| Candidate | Result |
| --- | --- |
| CISA `cisa.gov/cisa/news.xml` | 403 |
| FCC `news-events/headlines.rss`, `rss/headlines` | 403 |
| NTIA `ntia.gov/rss.xml` | TLS certificate failure |
| EPA `newsreleases/search/rss` | 202 with an empty body; disclaimers page limits documents to "non-commercial, scientific and educational purposes" |
| BIS `bis.gov/rss.xml`, `press-releases/feed` | 404 (covered through the Federal Register instead) |
| DOE Grid Deployment Office / Loan Programs Office `rss.xml` | 404 |
| White House `whitehouse.gov/feed/` | 404 (the section feeds work) |
| EveryCRSReport `rss.xml` | 200 but one item, off-beat |
| Bonneville Power Administration `bpa.gov/rss` | 404 |
| TVA `tva.com/rss`, Commerce `commerce.gov/feeds/news` | 403 (Cloudflare challenge) |
| SEC EDGAR 8-K Atom (`browse-edgar?action=getcurrent&type=8-K&output=atom`) | 200, 40 entries, but entries are filing-index pages authored by registrants, not public-domain text |
| European Commission press corner `keywords=energy` feed | 200 but returns the same 10 items as the unfiltered feed |
| European Parliament press RSS and legal notice | 202 with an empty body |
| ACER `news-and-events/news/rss`, Ofgem `news-and-updates/rss` | 404 |
| NESO `news/rss` | returns HTML, not a feed |
| IEA `rss/news`, `news/rss.xml`, `terms` | 403 (Cloudflare) |
| World Bank energy blog feeds and terms page | 404 |
| OECD press-release RSS and terms | 403 |
| METI English RSS and copyright page | 403 |
| DCCEEW (Australia) news RSS and copyright page | HTTP/2 stream error |
| Canada.ca NRCan Atom | 404; terms allow non-commercial reproduction only |
| `export.arxiv.org/rss/cs.DC` | 200, identical mirror of `rss.arxiv.org` (not needed twice) |
| SDxCentral feed | 403 (Cloudflare) |
| Data Centre Magazine `rss`, Bisnow data-center RSS, TrendForce press RSS, Synergy Research feed, TeleGeography blog RSS | 404 |
| Mission Critical Magazine | TLS handshake failure |
| Dell'Oro feed | connection timeout |
| Ember `feed/` | 403 (Cloudflare) |
| RMI `feed/` | 200 but a placeholder "Hello world!" post |
| PJM Inside Lines, NYISO | 202 with an empty body |
| ERCOT, CAISO, ISO-NE, NERC | 404 |
| MISO, EPRI | 403 |
| NREL | DNS resolution failure from the runner |
| ORNL | 404; PNNL | 403 ("Request Rejected") |
| Import AI (Substack) | 403 (Cloudflare) |
| `etnews.com/rss`, `ddaily.co.kr/rss/all.xml` | return HTML pages, not feeds |
| Terms pages that could not be read: NSF `/policies/copyright` (404), SEC privacy page under a browser user agent (403), LBNL `/about/` (404), The Next Platform `/about-us/` (404), Canary Media `/about/republishing` (404) | see the per-row notes above |

## D. Pipeline changes that make the expansion safe

- `selectPoolItems()` (`scripts/lib/fetch-feeds.mjs`): the one-item-per-source reservation is
  only taken by an item that is at least signal-card relevant (`infrastructure_relevance_tier`
  other than `archive_only`). A broad government feed whose best item is a hydro licence notice
  or a proclamation no longer displaces on-beat items from the 30-slot pool.
- Shared source names: the five Federal Register rows are all named `Federal Register` and the
  three arXiv rows `arXiv`, so `MAX_ITEMS_PER_SOURCE_IN_POOL` (6) applies per publication rather
  than per feed.
- `repairFeedLink()` recovers the article URL when a feed ships an escaped anchor tag as the link
  (ACER), and `publishedAtIso()` parses Drupal `D, m/d/Y - H:i` dates instead of throwing on
  `toISOString()`, which previously would have failed the whole feed.
- `scripts/lib/source-fetch.mjs` gained adapters for `arxiv.org` (abstract blockquote only,
  "Abstract:" prefix removed), `federalregister.gov` (`fulltext_content_area`, "Start Printed
  Page", "BILLING CODE" and the "[FR Doc. …]" trailer removed), `whitehouse.gov`
  (`entry-content`), `nsf.gov` (`node__content`), `sec.gov` (`field--name-body`),
  `acer.europa.eu` (`article`) and `ec.europa.eu` (an `apiTarget` hook that fetches the
  press-corner documents API as JSON — still on the allow-listed host, still through
  `fetchAuthorizedSourceText()` — and wraps `htmlContent` for the normal paragraph extraction).
  `fetchAuthorizedSourceText()` accepts optional `contentTypes` and `accept` overrides for that
  hook; its defaults are unchanged.
- `scripts/lib/relevance-classifier.mjs` normalises "data centre" / "datacentre" to the US
  spelling before scoring, so ACER, Ofgem, gov.uk and Commission items score like US ones (the
  ACER Portugal item moved from `archive_only` 0.22 to `signal_card` 0.64).
- The arXiv rows carry `text_scope: abstract`; `activeRegistryFeeds()` passes it to the feed,
  `parseFeedItem()` stamps `source_text_scope` on each item, and the classifier caps such items
  at the signal-card lane (`abstract_only_source_capped_at_signal_card`) while keeping the score
  for pool ordering. The first forced run (2026-09-10, run #3199) scored an arXiv abstract
  `full_memo` 0.83, generated a memo from 1,671 characters of source, and the final integrity gate
  quarantined it (`visible_body_below_4500`, `unsupported_claims:7`); as a signal card the same
  item publishes as a linked brief instead of costing a generation slot. Cached and legacy
  fallback pools (`PIPELINE_USE_EXISTING_POOL`, live-fetch failure) are re-stamped from the
  registry and reclassified by `hydrateSourceTextScope()`, so records written before the field
  existed cannot slip back into long-form generation. `selectColumnStory()` applies the same
  boundary to authored columns: an abstract-only record is never the primary source of a column,
  though it can still corroborate one anchored on a full document. The autonomous editorial
  cycle (`run:editorial-cycle`) keeps the scope through `scanSourceItems()`/`cleanScanItem()`,
  and `selectEditorialSignals()` holds a cluster anchored on an abstract-only source at
  `Watchlist Signal` instead of `Standard`/`Featured Analysis`. The public lane router
  (`routeStrictInfrastructureRelevance()`, shared by `applyPublicRouting()` and the
  `canGenerateFullArticle()` story gate) routes an abstract-only source to the adjacent lane
  whatever its score, and the maintenance regenerators (`regenerate:public-content-v2`,
  NarrativeDNA) re-stamp the scope from the registry before routing, so no later run can
  recreate a long-form page from an abstract. `abstractOnlyTextScope()` in
  `source-registry.mjs` is the single detector (stamped field first, registry row for legacy
  records).
- `parseFeedItem()` also flattens markup-wrapped feed fields (`textValue()`): the same run failed
  the ACER feed with "(item.title || '').trim is not a function" because every ACER title is an
  anchor element, which rss-parser returns as an object.
- Procedural docket notices stay archive-only. The Federal Register agency feeds carry hydro
  relicensing and EIS availability notices, pipeline blanket authorizations, exempt wholesale
  generator and information-collection notices whose text names "power" and "megawatts" often
  enough to saturate the grid dimension: run #3199 published the Hells Canyon hydro SEIS notice
  as a signal card at 0.615 on that score alone. `classifyInfrastructureRelevance()` now caps
  such a notice at 0.44 (`procedural_regulatory_docket_without_compute_context`) unless the text
  carries an unambiguous compute term ("AI", "artificial intelligence", "GPU", "data center",
  "colocation", "hyperscale", "semiconductor", "HPC", "large load", co-location, server racks or
  farms, digital infrastructure, crypto mining; a bare "training", "inference", "accelerator",
  "servers" or "Colo." does not count) in its source evidence (title, extracted body or feed snippet, source metadata;
  never the generated summary or insight), and `routeStrictInfrastructureRelevance()` archives it
  whatever its stored score, so the public
  content tier pass hides a record published before the guard existed. The guard only fires for
  docket sources (`federalregister.gov`, `ferc.gov`, `regulations.gov`, `govinfo.gov`, or a
  `federal-register-*`/`ferc-*` registry row) and only on a formulaic notice title ("Notice of
  Availability/Application/Request…", "Information Collection", "Blanket Authorization",
  "Exempt Wholesale Generator", "Environmental Impact Statement", "Hydroelectric", …) or FERC's
  "Take notice that" body opener, so an EIA analysis that mentions hydroelectric generation in
  passing is never touched. A FERC large-load rulemaking is a docket item too, but it names data
  centers and passes. Cached and legacy records are demoted as well: `refreshCachedRelevance()`
  (the successor of the text-scope hydration at the fallback pool, the column candidates, the
  autonomous scan and both regenerators) reclassifies a stored `signal_card`/`full_memo` record
  that the guard catches, so a curation-model outage cannot hand the deterministic ranker a
  notice that the live classifier would archive. The curation planner (`rollingCandidates()`)
  also drops definitively archived items (`definitivelyArchived()`: a docket notice, a hard
  archive topic, or an item already extracted and still archive-only) before the model or the
  ranker sees them, while a snippet-only archive estimate stays for the model to weigh. The
  autonomous scan carries the archive decision on the cleaned item (`procedural_docket_notice`,
  the tier and reasons), drops such items before clustering, and `selectEditorialSignals()`
  routes any cluster still anchored on one to `Internal Archive` whatever its signal score. The
  guard reads canonical source evidence (`source_evidence_text`/`cleaned_source_text` first;
  `contentText`/`articleText` only before extraction) because the autonomous writer stores
  generated prose in the body fields. The public product-fit projection
  (`publicSourceEvidence()`, verified title and artifact text only) now carries the registry id
  and source URL so the guard can recognise the notice there too, and `buildHomepageFeed()`
  never re-opens a docket archive route through a stored tier, so the already-published card
  leaves the homepage, RSS and sitemap on the next build rather than the next pipeline run.
- The Federal Register adapter drops the page's "Document headings vary by document type" note,
  which sits inside `fulltext_content_area` and opened every extracted document. (Feed Probe
  cannot read FR document pages: with the RSS accept header the site answers with its
  `unblock.federalregister.gov` access page; Terms Probe, with a browser accept header, and the
  pipeline fetcher get the document.)
- Tests: `tests/source-expansion-2026-09.test.mjs` covers the link/date repair, the pool
  reservation rule, both adapters, and checks that every expansion row is text-authorized for its
  real article host while every unreviewed row stays unfetched.

## E. How the new sources reach the wire and the columns

1. `activeRegistryFeeds()` now returns 22 feeds. Each `Update News` run fetches all of them,
   scores every item at fetch time, and builds the 30-item pool by relevance.
2. The curation model picks the run's stories from that pool; extraction then fetches the article
   page through the host allow-list and the adapters above. Federal Register documents, White
   House actions, NSF and SEC releases and ACER news pass as long-form when the cleaned text is
   at least 1,200 characters and the generated memo clears the 4,500-character detail contract;
   arXiv items are abstract-scoped and always publish as signal cards (linked briefs).
   Verification run #3199 on 2026-09-10 fetched 21 of the 22 feeds, loaded a 30-item pool
   (arXiv 6, Federal Register 6, DOE 5, NRC 5, GAO 3, DESNZ 2, EIA 1, FTC 1, White House 1),
   and published a Federal Register signal card to the homepage and RSS. The second forced run
   (#3200, v0.0.27, after the ACER fix and the abstract cap) fetched all 22 feeds
   (`failedSources=0`), loaded a 30-item pool (arXiv 6, Federal Register 6, NRC 5, DOE 4, GAO 3,
   DESNZ 2, ACER 1, EIA 1, FTC 1, White House 1) in which the six arXiv abstracts entered as two
   signal cards and four archive-only items and nothing scored `full_memo`, and the curation
   model selected none of the eight fresh candidates, so that run published nothing.
3. Authored columns draw on the same authorized pool and archive. A Federal Register order or an
   ACER assessment becomes column material the moment its extraction artifact passes, and its
   figures can enter the claim ledger as `verified_primary` because the text is the primary
   document itself. arXiv abstracts can corroborate a column but never anchor one.
4. Attribution on the site names the publication (`Federal Register`, `arXiv`, `The White
   House`); the article text identifies the agency or authors.

## F. Follow-ups

1. Watch the first Commission items through the pipeline: the documents API was verified for a
   press release (`IP`); other reference types in the feed (`MEX`, `SPEECH`, `QANDA`, `FS`, `AC`)
   use the same `TYPE/YY/NNNN` form but were not fetched individually. An item whose API call
   returns an empty body falls back to the feed snippet and is not published.
2. Read the terms pages for the "not yet" rows in section B (Questex, Foundry, AspenCore,
   TechPowerUp, Canary Media, Latitude, Carbon Brief, IEEFA, the Korean publishers) with
   `Terms Probe` and record a verdict; none of them authorises text reuse without a licence.
3. Re-check `ferc.gov/news-events/news/rss.xml` occasionally; if Cloudflare stops challenging the
   runner, `ferc-news` can go back to `active_feed` and the Federal Register FERC feed becomes a
   backup.
4. If NSF publishes a server-rendered copyright statement, point `nsf-news.terms_url` at it.
5. The Korean press rows are link-only; the `/ko/` lane keeps its manual KOGL process
   (`docs/korean-lane-sources.md`).
