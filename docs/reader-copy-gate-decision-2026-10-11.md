# Reader-copy gate decision — 2026-10-11

Decision record for `scripts/lib/reader-copy-guard.mjs` (PR #47, extended in PR #48) and `scripts/audit-reader-copy.mjs --strict`. Branch base: PR #48 head `69be3e8` merged with `main` at `bbc9a09`, which is also the commit behind the current Vercel production deployment of computecurrent.com at the time of writing.

## 요약

- **결정: `--strict` 감사를 운영 게이트에 편입한다.** `npm run audit:reader-copy` (= `node ./scripts/audit-reader-copy.mjs --strict`)가 `content:gate:built`의 마지막 단계로 실행되며, 따라서 `npm run content:gate`, 호스팅 CI(`validate-application`)와 Mac subscription 러너가 모두 같은 게이트를 통과해야 한다. 발행 레코드 27편 전부가 PR #48 정정 이후 0건 적발이므로 이력 마이그레이션은 필요하지 않고, 검사는 결정적·오프라인이며 1초 미만에 끝난다.
- **가드 적용 범위를 생성·검증 경로 전체로 확대했다.** `longformQualityResult`, `articleDetailQualityResult`(이를 통해 `finalPublicationIntegrityResult`, `writeJsonFile` 무결성 훅, EIA 복원 스크립트, publish cycle, blog engine v4, public feed regenerator), EIA 복원 스펙 빌더(스펙 단계에서 fail closed), subscription 러너의 독립 단계.
- **`input_provenance` 규칙을 조였다.** 공급 주체가 명시된 일반 문장("the vendor provided excerpts of the contract")은 통과하고, 주체 없는 "the supplied extract", 문장 첫머리의 "Provided excerpts show", 작성자가 수신자인 "the evidence I was given"만 적발한다. 저장된 1,117개 레코드 전체에서 기존 규칙과 조인 규칙 모두 0건이다.

## 1. Decision

`node scripts/audit-reader-copy.mjs --strict` joins the built content gate.

| Item | Value |
| --- | --- |
| Script | `audit:reader-copy` → `node ./scripts/audit-reader-copy.mjs --strict` |
| Gate | `content:gate:built` runs it after `audit:public`, `audit:images` and `audit:admin`; `content:gate` inherits it |
| CI | `.github/workflows/update-news.yml`, job `validate-application`, step "Run production content gate" (`npm run content:gate:built`), unchanged |
| Mac runner | `SUBSCRIPTION_NEWS_STEPS` runs the strict audit directly after `rebuild:taxonomy-pages`, before `npm test` and `npm run content:gate` |
| Scope | Stored records with a reader page across `authored-columns`, `latest-news`, `archived-news` (de-duplicated by id): `articlePagePublished === true`, or a column that the column route's own predicate `authoredColumnPublicEligible` accepts, plus every card the homepage and archive feeds render from `latest-news` and `archived-news` (`publicCardSignalsFor`: the uncapped `buildHomepageFeed` set and the `buildArchiveFeed` set behind `/archive/`, category, region and search pages), checked as the rendered card copy plus the presentation `buildPublicPresentation` builds from the stored record (so renderer precedence applies and an unreachable body or figure is not audited for a card-only record); every reader page is also checked against its built presentation |
| Failure | Exit 1 with a JSON report naming the record, field and matched text; nothing is rewritten or hidden |

Why yes, and why now:

- After PR #48 the audit reports 0 flagged records and 0 review warnings across the 27 published records (39,773 body words). There is no historical backlog to migrate, so the gate cannot block the build on day one.
- The check is deterministic, offline and runs in well under a second. It reads committed JSON, not the network or a model.
- The reasons are precise (`reader_copy:<rule>:<field>`), so a failure is actionable without re-running generation.
- The remaining risk was false positives in the rule set. Section 4 records the review and the tightening that removes the known case.

Why not a warning-only mode: the audit already separates hard copy findings from nonbinding `editorialReviewWarnings`; the warnings stay advisory and are not part of the gate.

## 2. Coverage map

Before this change the guard ran only inside `authoredColumnQualityResult`. Now:

| Path | Where the guard runs | Effect of a finding | Regression test |
| --- | --- | --- | --- |
| Authored columns (`generateAuthoredColumn`, column artwork readiness) | `authoredColumnQualityResult` (unchanged) | Column is not published; `reader_copy_issue_count` metric | `tests/reader-copy-guard.test.mjs` |
| Long-form news analyses (`audit-public-article-quality.mjs`, `run-content-cycle.mjs`, `generateLongformAnalysis`) | `longformQualityResult(article)` | `ok: false`, `reader_copy:*` reasons, `metrics.readerCopyIssueCount` | `tests/longform-quality.test.mjs`, `tests/public-longform-route-quality.test.mjs` |
| Every persisted public body (`finalPublicationIntegrityResult` → `writeJsonFile` integrity hook, `publish-cycle.mjs`, `blog-engine-v4.mjs`, `public-feed-regenerator.mjs`, `emergency-cleanup-public-content.mjs`, `regenerate-autonomous-analyses-v1.mjs`) | `articleDetailQualityResult(article)` | `article_detail:reader_copy:*` reason; the record is quarantined, not persisted as published | `tests/article-detail-quality-gate.test.mjs`, `tests/publication-integrity-boundary.test.mjs` |
| EIA restoration (`config/eiaRestorationArticles.json` → `buildEiaRestorationInventory` → `restore-eia-public-inventory.mjs`) | `eiaRestorationReaderCopyFindings(specs)` on title, deck, why-it-matters and body blocks, before any record exists; built records then pass through the detail gate above | `buildEiaRestorationInventory` throws; the restore run fails closed and writes nothing | `tests/eia-public-restoration.test.mjs` |
| Subscription runner (`scripts/run-subscription-news.mjs`) | Dedicated step `node scripts/audit-reader-copy.mjs --strict` on the final inventory, then again inside `npm run content:gate` | Run stops before `npm test`; local partial output preserved, nothing committed | `tests/subscription-news-runner.test.mjs` |
| Hosted validation and release | `npm run content:gate:built` → `npm run audit:reader-copy` | Job fails | `tests/reader-copy-gate.test.mjs` (package wiring, committed corpus, strict exit codes) |

Reader surfaces checked by `readerCopySurfaces()`: `title` (for a news record only when no `expertLensFull.finalHeadline` shadows it; the hub and entity lists' raw titles are covered by the audit from the feed), `deck`, `summary`, `snippet`, `why_it_matters`, `expertLensShort`, `metaDescription`, `body`, `imageAlt`, `image_alt`, `expertLensFull.finalHeadline`, `expertLensFull.metaDescription`, `expertLensFull.finalArticleBody`, `public_presentation.deck|why_it_matters|image_alt` (persisted values the renderer prefers), every `public_presentation.reader_impact[]` label, `public_routing.public_signal_label|editorial_lens`, top-level `region`, `source`, `primary_category` (and `category` only when no primary category is set), every `tags[]` pill, `author.name|role`, `sources[].title|name` for the column source entries the page keeps (a safe http(s) URL and a name), `sources[0].name` whatever its URL (the publication catalog prints it on `PublicationCard`), plus `sources[].author` for an Epoch AI source (the only licence line that prints it), `stance.thesis` (a column's catalog and digest "why it matters" line), for an authored column every rendered figure's `figures[].title`, `figures[].source_note` and `figures[].items[].label|display|source` (a figure without items renders nothing, and the news page never renders figures), and every dated `corrections[].summary` (the only notes `correctionNotes()` renders). `snippet`, `why_it_matters`, `expertLensShort` and the persisted `public_presentation` fields are new in this change: `why_it_matters` renders on cards and detail pages next to the deck (`buildPublicPresentation` prefers the persisted presentation values over the top-level fields), while `summary`, `snippet`, `expertLensShort` and `expertLensFull.metaDescription` are deck fallbacks (the page description, RSS description and catalog deck chains read them only behind the deck) and count only when no deck is stored; a column's `summary` always counts because the column page prints `summary || deck` as its description. Top-level `metaDescription` is not read by any renderer and is not a surface. Source evidence fields (`articleText`, `rawText`, `cleaned_source_text`, `source_evidence_text`) are never inspected, so a publisher's own wording cannot trip the guard.

## 3. Rule review against stored bodies

Method: `readerCopySurfaces()` plus `why_it_matters`, `snippet`, `expertLensShort` and `articleText` over all 1,117 stored records (`authored-columns`, `latest-news`, `archived-news`, `news-pool`), published or not, with each production rule and with deliberately broadened probes to measure how close legitimate prose comes to each rule.

| Probe | Hits (all records / published) | Reading |
| --- | --- | --- |
| `input_provenance` (previous rule) | 0 / 0 | Clean after PR #48; the 11 Kubernetes and 4 coding-agent hits were corrected there |
| `input_provenance` (tightened rule) | 0 / 0 | Same result; the tightening removes a false-positive class, not a true positive |
| `(supplied\|provided) (extract\|excerpt\|evidence\|source text\|text\|material\|documents\|data)` | 0 / 0 | No attributed-supply sentence exists in the corpus today, so the risk named in the task was prospective, not observed |
| `writer_extract`, `process_assurance`, `persona_scaffold`, `generation_field`, `instruction_scaffold` | 0 / 0 | Clean |
| `will not invent`, `standing position(s)`, `JSON`, `system\|user prompt`, `source text`, `I have been given`, `the extract`, `given to me\|us` | 0 / 0 | No near-misses |
| bare `extract(s)` | 8 / 3 | Verb uses ("operators will extract value") and one correction note ("contaminated source extract"); none match any rule |
| bare `excerpt(s)` | 19 / 0 | Semiconductor Engineering "Abstract Excerpt:" snippets and "excerpts of that discussion" in archived, unpublished source text; none match any rule |

Change made to `input_provenance`:

| Case | Previous rule | Tightened rule |
| --- | --- | --- |
| "the supplied extract", "THE PROVIDED EXCERPT", "the supplied evidence", "this provided excerpt" | flagged | flagged ("the" or a possessive before supplied/provided; a demonstrative only before a singular extract/excerpt) |
| "This provided excerpts from the filing to reviewers." (demonstrative subject + verb + plural object) | flagged (false positive) | passes |
| "This provided evidence that the forecast was conservative." (demonstrative subject + verb) | flagged (false positive) | passes |
| "Provided excerpts show a rise." (sentence-initial, no subject, including after a heading or paragraph break) | flagged | flagged |
| "based on provided excerpts", "using supplied extracts", "from provided excerpts" (preposition or participle, no supplier) | flagged | flagged |
| "Provided evidence shows the delay.", "Supplied source text does not include the date.", "based on supplied evidence", "from provided source text" (same two positions, evidence/source-text noun) | flagged | flagged (noun class restored in the thirteenth-pass follow-up) |
| "the evidence I was given", "the source text we have been given", "anything I have been given" | partly flagged | flagged (writer as recipient) |
| "the vendor provided excerpts of the contract", "EIA provided excerpts from the filing", "the utility supplied extracts of its load forecast" | **flagged (false positive)** | passes (attributed supplier) |
| "The supplier provided evidence of performance." | passes | passes |
| "Abstract Excerpt:", "excerpts of that discussion", "extract value" | passes | passes |

The other five rules were kept as they were: each matches wording that has no reader-facing use (`verified_claims`, `return strict JSON`, `I will not invent facts`, `my standing positions`, `the extract I have`).

## 4. What this change does not do

- It does not weaken extraction QA, repetition, source-fidelity, unsupported-claim, copyright or product-fit checks. The guard adds reasons to existing results; no existing reason was removed or relaxed.
- It does not rewrite, sanitize, hide or unpublish any record. A strict failure is a report; the fix is an evidence-grounded edit with a `corrections[]` note, as in PR #48.
- It does not certify factual accuracy. `editorialReviewWarnings` remain advisory and are not part of the gate.
- It does not change prompts, model pins, schedules, credentials or the production deployment.

## 5. Operating notes

```sh
# Report only (exit 0), JSON to stdout or --out
node scripts/audit-reader-copy.mjs --out .cache/reader-copy-audit.json
# Gate form, as run by content:gate:built and the Mac runner
npm run audit:reader-copy
```

When the gate fails:

1. Read `articles[].readerCopy.findings` for the record id, field and matched text.
2. Correct the copy from stored source evidence and add a `corrections: [{ date, summary }]` entry; the summary is itself reader copy and is checked.
3. For EIA records edit `config/eiaRestorationArticles.json` together with `src/data/latest-news.json`; the restore script rebuilds records from the config.
4. If the finding is a genuine false positive, tighten the rule in `scripts/lib/reader-copy-guard.mjs` with a regression test in `tests/reader-copy-guard.test.mjs`. Do not add allowlists to article data or skip records.

## 6. Validation

Run on this branch in a hosted container with `LLM_PROVIDER=disabled` (Node 22.22.0), mirroring the `validate-application` job:

| Check | Result |
| --- | --- |
| `node scripts/audit-reader-copy.mjs --strict` | 27 published records, 39,773 words, 0 flagged, 0 review warnings; every homepage- or archive-visible card without an article page (see `homepageCards` in the report), 0 flagged; exit 0 |
| `npm run check` | 0 errors, 0 warnings |
| `npm run test:node:source` (`PIPELINE_OFFLINE=0`) | 949/949 passed (includes the new and extended reader-copy, long-form, detail-gate, EIA and subscription-runner tests) |
| `test:quality-gate`, `test:relevance`, `test:taxonomy`, `test:repetition` (`PIPELINE_OFFLINE=0`) | all passed |
| `npm run build` | 102 pages built |
| `npm run content:gate:built` (with the new `audit:reader-copy` step) | built tests 21/21; rendered-output, public-copy, article-quality, homepage, feed-volume, image, admin-exclusion and strict reader-copy audits passed, exit 0 |
| `npm run test:node:built` | 15/15 passed for the five tests that do not launch a browser; the three admin runtime tests that launch Google Chrome (`channel: 'chrome'`) could not run in the container, which has no Chrome install. Hosted CI runs them on `ubuntu-latest`. |
| `node scripts/audit-omo-ultra-current-state.mjs` | regenerated report unchanged |

Not done here: production deployment, release approval, or any live-site check beyond confirming that production currently serves `main` at `bbc9a09`.

## 7. Review follow-up (same day)

The automated Codex review of the pull request raised three points, each verified against the code and fixed in the same change:

1. `public_presentation.title|deck|why_it_matters|image_alt` are persisted copy that `buildPublicPresentation` prefers over the top-level fields; they are now reader surfaces.
2. Whitespace normalization collapsed paragraph breaks, so a sentence-initial "Provided excerpts show" after an unpunctuated heading escaped the tightened rule. Normalization now keeps line breaks and the rule treats a line break as a sentence start.
3. The strict audit only looked at records with an article page, while the homepage also renders signal cards and briefs. The audit now also checks every card the feeds render (rendered copy and stored record), reports `homepageCards` / `readerCopyFlaggedCards`, and fails strict mode on either count.
4. A second pass noted that capping the card set at the homepage's 50 items would skip older cards still visible on `/archive/`, category, region and search pages. The card set is now the union of the uncapped homepage feed and the full archive feed.
5. A third pass noted that `articleImageAlt()` renders `imageAlt || image_alt`; the snake_case spelling is now a reader surface too.
6. A fourth pass noted that column routes are selected by `authoredColumnPublicEligible`, which does not read `articlePagePublished`; the audit now scopes columns with that predicate (union with the flag) so a legacy or imported column without the news flag is still audited.
7. The same pass noted that `public_presentation.reader_impact` labels render as pills on every card; they are now reader surfaces and part of the rendered-card projection.
8. A fifth pass showed that "This provided evidence that…" (demonstrative subject + verb) matched the determiner form. With "evidence"/"source text" the rule now accepts only "the" or a possessive determiner; the extract/excerpt nouns keep the full determiner list.
9. A sixth pass noted that an opening quote, bracket or list marker (`“Provided excerpts…`, `- Provided excerpts…`, `> Provided excerpts…`) defeated the sentence-start branch; the lookbehind now allows those characters between the boundary and the phrase.
10. The same pass noted that card components also render `signal_label`, `editorial_lens`, `region`, `source` and `category` chips; they are now reader surfaces (presentation, routing and top-level fields) and part of the rendered-card projection.
11. A seventh pass noted that the tightened rule had dropped unattributed prepositional and participial uses ("based on provided excerpts", "using supplied extracts") that the original rule caught; a preposition/participle alternative restores them while attributed subjects still pass.
12. An eighth pass asked for `tags[]` (news-page pills). A final inventory of the article and column templates (`news/[id].astro`, `column/[slug].astro`, `ArticleHeader`, `SourceAttribution`, `SourceLicense`, `ColumnFigure`, `EditorialCorrectionNote` and the card components) added the remaining rendered text fields in one step: `tags[]`, `author.name|role` and `sources[].title|publisher|name|author`. Every text field those templates render from a record is now a reader surface.
13. A ninth pass: a colon or semicolon label before the phrase ("Evidence note: Provided excerpts…") now counts as a sentence boundary; a card-only record is audited on the stored fields that feed the card rather than on an unreachable body, so a hidden legacy body cannot block the gate; `stance.thesis` (the column catalog's and weekly digest's "why it matters" line) is a reader surface.
14. A tenth pass: `buildPublicPresentation` never reads the persisted `public_presentation.title|region|source|category` (title comes from card copy or the headline, the rest from top-level fields), so those persisted values are no longer surfaces and stale metadata cannot block the gate; label, lens and lane stay as route fallbacks. The same pass showed "This provided excerpts from the filing to reviewers" (demonstrative subject, plural object) matching the determiner form; a demonstrative now counts only before a singular extract/excerpt.
15. An eleventh pass made the guard and the audit follow renderer precedence: a top-level `body` shadowed by `expertLensFull.finalArticleBody`, or a top-level `deck`/`why_it_matters`/image alt shadowed by a persisted presentation value, is not a reader surface; and the audit now checks the presentation `buildPublicPresentation` actually builds for every reader page and card-only record (so a deck synthesized from source text for a page outside the feeds is covered, and a shadowed stale fallback cannot fail the gate).
16. A twelfth pass limited the deck/why-it-matters/image-alt shadowing to news records: authored columns bypass `buildPublicPresentation` (`column/[slug].astro` and `buildColumnCards()` read `deck` and `imageAlt` directly), so their top-level fields always count and the audit does not build a news presentation for them. The column identity markers moved to the import-free `scripts/lib/authored-column-identity.mjs` (re-exported by the policy) so the guard can tell the two apart without a circular import.
17. A thirteenth pass dropped `public_presentation.signal_label|editorial_lens|lane_title` as surfaces: `normalizedRoute()` always supplies a non-empty label, lens and lane (with hardcoded fallbacks) before `buildPublicPresentation()` reads the persisted values, so they never render; the rendered-card and built-presentation projections now carry those chips through the `public_routing.*` surfaces instead. The same pass added the raw `title` and `source` of a card-only record to the card audit, because the hub and entity pages (`src/pages/hubs/[slug].astro`, `src/pages/entities/[slug].astro`) list feed records by those stored fields rather than by the card copy.
18. A fourteenth pass restored the evidence and source-text nouns to the sentence-initial and prepositional provenance branches (`Provided evidence shows…`, `Supplied source text does not include…`, `based on supplied evidence`), which the tightened rule had covered only for extract/excerpt. Attributed uses (`The supplier provided evidence of the delay`, `evidence supplied by the utility`) and the demonstrative-subject form still pass; all 1,087 stored records remain free of provenance matches.
19. A fifteenth pass removed two surfaces nothing renders: `public_routing.laneTitle` (no component prints the lane title; the homepage lane strip is a hardcoded list, and a deck the lane helps generate is audited as the deck) and `sources[].publisher`. The column source list is now audited the way `column/[slug].astro` renders it: only entries with a safe http(s) URL and a name count, `title` and `name` are surfaces, and `author` only when the URL is an Epoch AI article (the one licence line that prints it).
20. A sixteenth pass aligned two selection rules with the renderers: shadowing now uses the renderer's own truthiness (`persisted.deck || deck`, `finalArticleBody || …`), so a whitespace-only persisted value hides the top-level fallback exactly as `buildPublicPresentation()` and the templates do; and `sources[0].name` is always a surface because `columnPublications()` prints the first source's name on `PublicationCard` whatever its URL, while the other source fields still follow the column page's URL-and-name filter.
21. A seventeenth pass: (a) figures are a column-only surface and only when they render (`news/[id].astro` never reads them; `ColumnFigure` emits nothing without items), with the column gate's candidate now carrying the column identity; (b) correction notes follow `correctionNotes()` (a YYYY-MM-DD date and a non-blank summary), shared through `isRenderedCorrection()`; (c) the provenance rule catches the writer as passive recipient (`we were provided excerpts`, `I was supplied the source text`, `the excerpt was provided to us`) while attributed recipients (`the utility was provided excerpts`, `excerpts were provided to the commission`) pass; (d) the audit's news-page scope is the news route's own gates (`publicLongformRouteGates`, split out of `isPublicLongformArticle`) rather than the page flag alone, so a quarantined, archive-only, noindexed, product-unfit or source-unauthorized record with the flag is not audited, while a record the detail gate rejects only for reader copy stays in scope and is reported. The committed inventory is unchanged (every flagged news record passes the route gates).
22. An eighteenth pass: (a) figure item fields follow `ColumnFigure`'s type branches (label and display for `stat-row` and `bar`; label, display and source for `table`; caption only for any other type); (b) the sentence-start lookbehind accepts a numbered list prefix (`1)`, `(2)`, `12.`); (c) `summary`, `snippet`, `expertLensShort` and `expertLensFull.metaDescription` are audited only when no deck is stored, because every renderer reads them behind `presentation.deck` (a column's `summary` still always counts), and the never-rendered top-level `metaDescription` is no longer a surface.
23. A nineteenth pass: a news record's raw `title` is a surface only when no `expertLensFull.finalHeadline` shadows it (`displayHeadline()`, card copy, the presentation, structured data, RSS, the catalog, the ticker and the newsletter all read the final headline first); because the hub and entity lists print a feed record's raw title, the audit checks the raw title and source of every record with a feed card, page or card-only. A column's title always counts (the column page prints it directly), and the never-read top-level `headline` is no longer a surface.
24. A twentieth pass: (a) the provenance rule also catches the writer as active recipient (`I received excerpts`, `we received the source text`, `we obtained evidence`), while an attributed recipient (`the commission received excerpts from the utility`) passes; (b) the persisted `public_presentation.deck|why_it_matters|image_alt|reader_impact[]` surfaces apply only to news records, because no column renderer reads a column's `public_presentation`; (c) the legacy `category` is a surface only when no `primary_category` is set, since every renderer selects `primary_category` first.
25. A twenty-first pass: (a) the byline (`author.name|role`), the source list (`sources[]`) and the thesis (`stance.thesis`) are column-only surfaces, because `news/[id].astro` passes no author to `ArticleHeader`, its structured data names the site, and no news renderer reads `sources[]` or `stance`; (b) the passive-recipient branch accepts an optional `with` (`I was provided with excerpts`, `we were supplied with the source text`), while an attributed recipient (`the commission was provided with excerpts`) passes.
26. A twenty-second pass audits every rendered variant of a card: the homepage and archive feeds build a record's card separately, each with its own `recentDecks` sequence, so `ensureUniqueDeck()` can give the archive, category, region and search card a different deck from the homepage card. `publicCardSignalsFor()` now keeps every distinct variant (dropping only exact duplicates) and the audit checks each variant for page records and card-only records alike; `homepageCards` still counts distinct cards.
27. A twenty-third pass: (a) the active-recipient branch accepts the perfect tenses (`I have received excerpts`, `we had collected evidence`, `we have gotten the extracts`) while an attributed recipient (`the commission has received excerpts`) passes; (b) `public_routing.public_signal_label|editorial_lens` and `tags[]` are news-only surfaces, because no column renderer reads `public_routing` and a column's tags only feed the publication explorer's search index (the news page is the only place tag pills render).
28. A twenty-fourth pass: (a) `readerCopyResult(record, { route: 'detail' })` keeps only what `news/[id].astro` renders (headline, deck, image alt, body, tags, source, category, dated correction notes) and drops the card-only fields (`why_it_matters`, the persisted why-it-matters and reader-impact pills, the routing chips, `region`); `articleDetailQualityResult` uses it, and the audit uses it for a page without a feed card (a page with a card is still checked on every field, because its card renders them); (b) the recipient branches accept the contractions `I've`/`we've`/`I'd`/`we'd` (`I've been provided with excerpts`, `we've received the source text`).
