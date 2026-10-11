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
| Scope | Stored records with a reader page across `authored-columns`, `latest-news`, `archived-news` (de-duplicated by id): `articlePagePublished === true`, or a column that the column route's own predicate `authoredColumnPublicEligible` accepts, plus every card the homepage and archive feeds render from `latest-news` and `archived-news` (`publicCardSignalsFor`: the uncapped `buildHomepageFeed` set and the `buildArchiveFeed` set behind `/archive/`, category, region and search pages), checked as the rendered card copy and as the stored record behind it |
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

Reader surfaces checked by `readerCopySurfaces()`: `title`, `headline`, `deck`, `summary`, `snippet`, `why_it_matters`, `expertLensShort`, `metaDescription`, `body`, `imageAlt`, `image_alt`, `expertLensFull.finalHeadline`, `expertLensFull.metaDescription`, `expertLensFull.finalArticleBody`, `public_presentation.title|deck|why_it_matters|image_alt`, every `public_presentation.reader_impact[]` label, every `figures[].title`, `figures[].source_note`, `figures[].items[].label|display|source`, and every `corrections[].summary`. `snippet`, `why_it_matters`, `expertLensShort` and the persisted `public_presentation` fields are new in this change: they render on cards and detail pages next to the deck (`buildPublicPresentation` prefers the persisted presentation values over the top-level fields), and the detail gate already treated the top-level ones as public text. Source evidence fields (`articleText`, `rawText`, `cleaned_source_text`, `source_evidence_text`) are never inspected, so a publisher's own wording cannot trip the guard.

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
| "the supplied extract", "THE PROVIDED EXCERPT", "the supplied evidence", "this provided excerpt" | flagged | flagged (determiner directly before supplied/provided; with "evidence"/"source text" only "the" or a possessive) |
| "This provided evidence that the forecast was conservative." (demonstrative subject + verb) | flagged (false positive) | passes |
| "Provided excerpts show a rise." (sentence-initial, no subject, including after a heading or paragraph break) | flagged | flagged |
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
