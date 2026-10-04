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

- `ITEMS_PER_RUN` 2 → 3 and `DAILY_CURATION_TARGET` 6 → 9. The daily target is also the
  per-day processing cap; `PIPELINE_FORCE_SLOT` (the `force_wire` input) lifts it.
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

## Configuration

| Variable | Default |
| --- | --- |
| `ITEMS_PER_RUN` / `DAILY_CURATION_TARGET` | 3 / 9 |
| `CURATION_FLOOR` / `CURATION_FLOOR_MIN_RELEVANCE` | 3 / 0.55 |
| `CANDIDATE_MAX_AGE_HOURS` | 168 |
| `AUTHORED_COLUMN_MIN_RELEVANCE` / `AUTHORED_COLUMN_MIN_FACTS` | 0.6 / 3 |
| `AUTHORED_COLUMN_MAX_STORY_ATTEMPTS` / `AUTHORED_COLUMN_MAX_ANCHOR_AGE_DAYS` | 2 / 21 |
| `LLM_RUN_BUDGET_TOKENS` / `LLM_RUN_BUDGET_CALLS` | 120000 / 60 |
