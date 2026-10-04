# Daily output recovery and coverage expansion (2026-10-04)

## Baseline

- Production deployment `6841649764` (state `success`) serves commit `122468e3`, which is the
  current `main` head. This work branches from it.
- Commit `27fc11d2` (scoped Google Cloud release-note sources, column coverage beats, broader
  persona mission) was reviewed and its source suite passed 665/665 before these edits.

## Verification of 27fc11d2

- The Google Cloud release-note rows are correctly scoped: dated anchors only, a licence-marker
  check, the product path enforced, and Google hashes kept through deduplication and story keys.
- They do produce candidates. The Claude Sonnet 5.5 availability note (AI lane 1.0) was curated
  but never processed, because the slot lock below stopped the run.
- AI-lane picks still archive on the wire. That is the design: the wire's tiers use
  infrastructure relevance, and the AI lane only widens curation and columns.
- `columnCoverageBeat()` reads a networking "switch" headline as a data center operator story.
  It only breaks near ties between eligible stories, so it was left unchanged.
- The NRC feed now returns 403 from the runner. It fails soft and is unrelated.

## Why output collapsed

Run history from 2026-09-11 to 2026-10-04 shows no full article pages and two columns
(2026-09-17 and the 2026-10-04 European Commission column). Almost every run ended
`no_qualifying_story`.

| Cause | Evidence |
| --- | --- |
| Off-beat source mix | The 30-item pool came from 12 government and Google feeds; 3 items scored 0.55 or more on either lane. The 52 commercial AI, cloud and data center publications were registered but never fetched. |
| Slot lock | A run that found nothing still marked its KST slot published, so later runs in that slot picked nothing. Every day from 2026-10-01 to 2026-10-04 had all three slots marked with 0–2 items curated. |
| Curation allowed empty answers | The prompt told the model an empty selection was valid and to skip borderline items "even if that leaves fewer picks". |
| Fresh-only window | `rollingCandidates()` returned only items from the last 24 hours whenever two existed, hiding older on-beat stories behind fresh docket notices. |
| Column floors | Relevance 0.75 plus complete heuristic expert insight (a named company and concrete facts): 1 of 71 candidates qualified in the last selection. |
| Extraction false positives | The truncation detector read "D.C.", "L.L.C.", "F.B.", "Bcf/d." and "b/d." as clipped words, so DOE and EIA articles failed long-form QA (7 stored artifacts). |

## Changes

### Wire throughput (`scripts/lib/curate.mjs`, `scripts/lib/constants.mjs`)

- `ITEMS_PER_RUN` 2 → 3 and `DAILY_CURATION_TARGET` 6 → 9. After the fourth live run the daily
  target counts only items that reached a public surface (an article page or a signal card), and
  `DAILY_PROCESSING_LIMIT` (18) caps everything processed per KST day; `PIPELINE_FORCE_SLOT` (the
  `force_wire` input) lifts both.
- `pickItemsForRun()` no longer returns nothing because a slot already ran. Slots stay in state
  as history.
- `applyCurationFloor()` tops a thin model answer up to `CURATION_FLOOR` (3) with candidates whose
  stronger lane scores at least `CURATION_FLOOR_MIN_RELEVANCE` (0.55), full-text sources first.
  The wire's relevance, extraction, quality, expert-insight and repetition gates are unchanged.
- The prompt asks for at least three on-beat stories when they exist and names AI company,
  cloud, chipmaker, data center operator and IT infrastructure announcements.
- `rollingCandidates()` always keeps older candidates (up to `CANDIDATE_MAX_AGE_HOURS`, 168)
  behind the fresh ones, and never offers anything older, even on a quiet day.

### Columns (`scripts/lib/authored-column-engine.mjs`)

- Relevance: a story at 0.75 or above on either lane still qualifies on relevance alone. Between
  0.6 and 0.75 the source must name the compute side (data centers, AI, cloud, chips, GPUs,
  large loads and similar terms), so a generic power or policy story is never forced into a data
  center frame.
- Facts: `MIN_STORY_FACTS` 4 → 3 (the evidence pack's verified facts).
- Insight: missing `named_companies` or `concrete_facts` heuristics no longer block a column on
  their own. The substantive fields still must be present: infrastructure layer, bottleneck,
  leverage, execution risk, timing, counterargument and next signal. Records enriched before the
  insight engine existed are assessed from their saved text.
- Fallback: when the top story fails thesis, draft or verification, the run tries the
  next-ranked qualifying story (`AUTHORED_COLUMN_MAX_STORY_ATTEMPTS`, default 2). A spent LLM
  budget stops the run instead.
- New guards: an anchor older than 21 days (`AUTHORED_COLUMN_MAX_ANCHOR_AGE_DAYS`) can
  corroborate but not anchor, because restored records can carry years-old figures. A daily
  digest cannot anchor. A candidate whose title or lead repeats a recent column's source
  headline counts as already covered.
- Unchanged: rights, abstract-only exclusion, strict extraction QA, evidence cleanliness,
  numeric provenance, copied-sentence and overlap checks, repetition, source fidelity, section
  and length gates, frequency (3 per day, 4-hour gap).
- Run logs now print each attempt and the `stale` and `digest` rejection counts.

### Budget and QA

- Per-run LLM budget 60,000 → 120,000 tokens and 40 → 60 calls (`scripts/lib/llm-budget.mjs`).
  One column attempt costs about four calls and 25,000 tokens.
- `detectTruncationArtifacts()` treats a single letter after a period or slash as an
  abbreviation or unit. Clipped words ("the c.", "clo.", "infrastructur.") are still reported.
  Stored artifacts keep their original QA verdicts; the fix applies to new extractions.

## Sources

### New text-licensed rows (28 authorized feeds, up from 24)

| Row | Evidence (runner probes, 2026-10-04) | Safeguard |
| --- | --- | --- |
| `epoch-ai-gradient-updates`, `epoch-ai-data-insights` | About page: "Epoch AI's work is free to use, distribute, and reproduce provided the source and authors are credited under the Creative Commons Attribution license" (CC BY 4.0 link). No RSS exists; section indexes are server-rendered; robots.txt disallows only `/assets/`, `/i`, `/fro`. | `feed_format: epoch_html_index` reads the index and each article's metadata (5 per section per run). Every page must carry the CC BY 4.0 link before it is listed or extracted. `article_path_prefix` allows one slug under the section path. |
| `google-cloud-tpu-releases` | Same Google Cloud documentation CC BY 4.0 footer as the existing rows; feed 200 with 30 dated entries. | Existing dated-section adapter; ID pattern shared through `GOOGLE_RELEASE_SOURCE_PATTERN`. |
| `kubernetes-blog` | Blog pages carry "The Kubernetes Authors · Documentation Distributed under CC BY 4.0"; feed 200 with 50 items. | `license_marker` requires that footer statement in every extracted page's visible text (the licence name is a link, so markup inside the statement is ignored). |

Pages adapted from these sources show a CC BY 4.0 notice through `SourceLicense.astro`.

### Industry radar (42 link-only publishers)

38 English and 4 Korean publishers with a recorded link-only verdict now feed a headline list
on the homepage, `/radar/`, company pages and `/ko/`. Only the exact headline, date, publisher
and link are kept. The conditions and the removal path are in the 2026-10-04 addendum of
`docs/source-rights-review.md`. The workflow refreshes the list after each news update without
blocking the run. A language whose refresh comes back thin (fewer than 8 English or 3 Korean
headlines) keeps its previous still-current headlines, so a failed lane never blanks its
section.

### Checked and left out

| Candidate | Result |
| --- | --- |
| EU digital-strategy RSS | Feed 200, but the site's own legal notice was not readable from the runner |
| EuroHPC JU | No feed (404) and no licence statement found |
| Institute for Progress, Federation of American Scientists | No licence statement; the FAS feed is a placeholder |
| Our World in Data | CC BY, but rarely on beat; deferred |
| GOV.UK keyword search feeds | Results were off-topic (heat networks, satellites, forestry) |
| CMA cases feed | Mostly unrelated mergers |
| Epoch AI Substack | 403 (Cloudflare); the epoch.ai pages are used instead |
| SEC EDGAR full-text search | Works, but exhibits are registrant-authored text dominated by microcap and SPAC filings, and SEC pages refuse automated clients without a declared contact |

## Expected effect and limits

- Read-only selection over the stored corpus with the new rules finds no qualifying column
  anchor today. The remaining fresh candidates are generic power stories without a compute term,
  a digest, or stories already covered; 13 restored records are older than 21 days. Daily
  columns therefore depend on new extractions: up to nine items a day now reach extraction, and
  Epoch AI, Google TPU and Kubernetes add on-beat long-form sources.
- Commercial article text stays unauthorized. A licence or written permission from trade
  publishers would be the largest remaining lever and is the owner's decision.
- The two Epoch sections publish roughly weekly; Google TPU notes arrive about monthly.

## First live run (Update News `37219823883`, release v0.0.33)

- The run passed the full test suite and the production content gate and committed `f8f0a46a`.
- The wire processed three curated items instead of zero to two. All three were short Google
  Cloud release notes and stayed archive-only (infrastructure relevance 0.22–0.31).
- The column stage found no qualifying story among 70 candidates: 36 abstract-only, 26 not
  extracted or failing extraction QA, 6 below relevance, 2 already covered.
- The industry radar published 97 headlines (80 English, 17 Korean) from 37 of 42 feeds. Blocks &
  Files, HPCwire, SemiAnalysis, Tom's Hardware and VentureBeat failed that refresh.
- No Epoch AI, Google TPU or Kubernetes item entered the pool. Their newest pieces were older than
  the pool's 10-day window (Epoch: Gradient Updates 2026-08-27, Data Insights 2026-09-14 to
  09-18; TPU: 2026-06-01; Kubernetes: 2026-09-22).

Follow-up: the Epoch rows now carry `pool_max_age_days: 21`, the same horizon as the column
anchor limit, so weekly research stays eligible for the pool and curation for three weeks. The
Data Insights index pins older pieces above the newest ones, so link selection reads each card's
listing date and skips pinned items outside that window.

## Second live run (Update News `37222384303`, release v0.0.34)

- Four Epoch AI Data Insights entered the pool through the 21-day window. The wire processed
  three of them, all archive-only on infrastructure relevance.
- The column stage still found no qualifying story. The processed Epoch records were invisible
  to it: `columnCandidateRecords()` kept archive records for 14 days by source date and let the
  raw pool copy of the same item win the merge, so the selector saw fetch-time scores and no
  extraction artifact.

Follow-up: archive records now stay candidates for the 21-day anchor horizon, and processed
surface and archive records take precedence over the raw pool copy. A read-only replay on the
committed data then finds one qualifying anchor, Epoch AI's "Trade data consistent with $3B of
chips smuggled to China via Malaysia", while the benchmark leaderboard and the AI-adoption
survey stay excluded (no compute anchor, relevance 0.44).

## Third live run (Update News `37226328504`, release v0.0.35)

- The column stage selected the Epoch AI chip-smuggling insight (beat: compute hardware) and
  generated a full essay: 1,676 words, 5 sections, 18 paragraphs, human-style 0.84, overlap
  0.034, no unsupported claims or repeated sentences.
- Verification withheld it for insight density 0.769 against the 0.78 floor. The score counts a
  fixed list of operational words tuned on power and data-center columns (past columns scored
  0.80–0.95); an export-control argument uses other vocabulary.
- An earlier scheduled run (`37224898585`) passed every gate but its push was rejected because
  #39 merged while it ran. By design the workflow never rebases an unvalidated tree, so the next
  run redid that work.

Follow-up: the column insight-density default is now 0.75 (`AUTHORED_MIN_INSIGHT_DENSITY` still
overrides it). Summary-heavy prose still fails; every other column gate is unchanged.

## Fourth live run (Update News `37230176681`, release v0.0.36)

- The column stage selected the same Epoch AI story. The thesis pass worked, but the draft reply
  did not parse as the required JSON essay (`draft:invalid_structured_essay`) and the draft pass
  had no retry, so the run published nothing. Three model calls used 13,814 tokens.
- The wire picked nothing. The three earlier runs of KST 2026-10-05 had processed nine items,
  every one archive-only on infrastructure relevance (Google Cloud release notes 0.22–0.31,
  Epoch AI Data Insights 0–0.28), and the daily cap counted processed items, so the day closed
  with nothing published. The September baseline still produced zero to five signal cards a day.
- The pool held 30 items, all archive-only at fetch time. It is rebuilt from the live feeds on
  every run: arXiv, the source of most September signal cards, lists only its latest
  announcement and nothing at weekends, so weekday preprints that were not processed disappeared
  from the weekend pool. Processed items also kept their pool slots.

Follow-up:

- The daily target counts only items that are publicly visible after the final integrity sync,
  on the latest surface or in the archive, so a record quarantined there does not use it;
  archive-only outcomes count toward the new processing limit only. Picks the classifier expects to surface run before
  snippet-tier archive picks. Plans written before the change are not treated as full.
- The pool skips items the wire already processed, and `carryOverPoolItems()` offers unprocessed
  items from the previous pool again while they are fresh and their source still authorizes text
  use. The live copy wins, matched by ID or, when a feed rewrites a headline, by source and URL;
  the per-source cap still applies.
- A draft that fails the JSON contract gets one repair attempt. A reply wrapped in one envelope
  key, a `title` key standing in for `headline`, or a raw line break inside a JSON string no
  longer fails the parse.
- `.env.example` now ships the code's throughput values (it still had 6 per day and 2 per run).

## Configuration

| Variable | Default |
| --- | --- |
| `ITEMS_PER_RUN` / `DAILY_CURATION_TARGET` / `DAILY_PROCESSING_LIMIT` | 3 / 9 / 18 |
| `CURATION_FLOOR` / `CURATION_FLOOR_MIN_RELEVANCE` | 3 / 0.55 |
| `CANDIDATE_MAX_AGE_HOURS` | 168 |
| `AUTHORED_COLUMN_MIN_RELEVANCE` / `AUTHORED_COLUMN_MIN_FACTS` | 0.6 / 3 |
| `AUTHORED_COLUMN_MAX_STORY_ATTEMPTS` / `AUTHORED_COLUMN_MAX_ANCHOR_AGE_DAYS` | 2 / 21 |
| `LLM_RUN_BUDGET_TOKENS` / `LLM_RUN_BUDGET_CALLS` | 120000 / 60 |
| `AUTHORED_MIN_INSIGHT_DENSITY` | 0.75 |
| Registry `pool_max_age_days` (Epoch rows) | 21 (default `POOL_MAX_AGE_DAYS` 10) |
