# Column and artwork recovery

## Observed baseline

- Repository and live production matched `2fa71afc596100260e78539efde76683bd25a235` before edits.
- The latest Update News run was `37171311093`, successful on 2026-10-04. All 52 runs reviewed since September 16 returned `no_qualifying_story` rather than failing model generation.
- The most recent column was created on September 16 UTC. There were 18 columns, only two with valid unshared Codex sources and 16 awaiting dedicated replacements.
- The default one-item queue repeatedly returned Switch's IPO column (`col_776dcf6e9c89b581`). Its source extraction had failed with HTTP 403 and only 191 available characters. Stopping at this item prevented any later image job from advancing.

## Root causes and repair

The authored selector required the wire's `named_companies` field even for policy stories whose concrete actor is a public institution. The European Commission data-center efficiency proposal (`4b3da08b458bdc0a`) had current text permission, clean extraction, relevance 0.822 and sufficient evidence but was rejected solely for the absent company name.

The repair accepts this narrow named-policy-actor case. It leaves the global wire gate and relevance/quality thresholds unchanged and explicitly enforces current text rights, abstract-only exclusions, extraction QA, clean evidence and source eligibility for supporting material too. Saved extraction text is used consistently in evidence packing, the claim ledger and the model context. `authored.lastSelection` and run logs now retain first-rejection counts.

Read-only simulation of the current 86 candidates after repair:

| Outcome | Count |
| --- | ---: |
| Abstract-only | 36 |
| Extraction ineligible | 28 |
| Incomplete substantive insight | 15 |
| Below relevance threshold | 6 |
| Qualifying | 1 |

The image CLI now reports ready and blocked work separately, applies the generation limit after readiness checks, and supports per-run exclusion without marking the item complete. Current permissions, intact extraction artifacts, bidirectional source attribution, original authored quality, numeric provenance and repetition remain required. Existing pages and images are not unpublished or deleted by this repair.

## Artwork

The EIA-backed column `col_ba22f5ea8bef96e6`, **Hormuz volatility exposed diesel backup as an unhedged margin line**, passed current source/artifact checks and the existing authored quality contract (1,661 words, no flagged unsupported numeric claims or repetition). Its two cited EIA articles were opened and reviewed. Its source-derived commodity observations are distinct from the author's data-center operating-risk interpretation; automated checks alone do not establish every nonnumeric assertion.

A new native Codex illustration shows backup generators, fuel tanks and delivery logistics. It was visually checked for subject fit, no readable text/logos/watermarks and crop suitability, then imported with fingerprint `f1af5034debbdd22ff0c3fc37d5997436dddce8c53a2da907b7033249b81efc7`. No existing image was reused. Original returned file:

`/Users/josh/.codex/generated_images/019dc517-a381-7733-b96f-477dbe23124b/exec-4addb840-aea7-4c17-b00a-da9bdfcc3e72.png`

The other 15 legacy replacements remain editorial holds: their current stored sources lack valid extraction artifacts and all 15 currently have text-use authorization disabled in the source registry. They are not reported as completed or silently dropped. Recovering authorized, source-faithful evidence is separate from generating an illustration; this repair does not invent permissions or reconstruct provenance from unverified legacy text.

## Automation and verification

The existing `compute-current` heartbeat remains active on the same schedule and production target. It now reads the correct `authored` state, handles blocked jobs without stopping ready work, distinguishes pending from completed images, and reports a new 72-hour column stall once rather than treating repeated selection emptiness as indefinite health. No new provider, API key, credential export, source licence, force option or schedule was introduced.

Before the final review fixes, the full suite passed 643 source tests, 22 built tests, build, quality, relevance, taxonomy and repetition checks. After those fixes, all 77 focused generation/image regressions passed. The final production content gate also passed: type checking reported no errors or warnings, 93 pages built, 21 gate regressions passed, and the public output, copy, article quality, homepage, feed, image and admin-exclusion audits passed with no broken images. The EIA column's registration is valid and unshared, all four source/variant files decode as WebP, and its ID-specific queue has zero pending or blocked jobs.

Production deployment `dpl_EJGCzFTF7aM3iifaZoYBAoSBAUSD` reached READY at commit `3a2142230cc2363e9d4f826371be667c14a55fc6` on the real domain. The EIA column returned HTTP 200 and its three image variants returned HTTP 200 with byte hashes equal to the verified local files. Desktop and mobile browser checks found no page errors or horizontal overflow, and the hero loaded at its native 1536-pixel width.

Unforced Update News run `37188494811` completed successfully, including the full test suite and production content gate. It selected the European Commission story (one qualifying item among 71), proving the selection repair in the actual production workflow. It did **not** publish a new column: both revision attempts failed the unchanged `fewer_than_4_sections` gate. The generated draft was not retained, so the logs establish the structural failure but not its exact formatting cause.

The follow-up repair asks the draft and voice passes for explicit `opening_paragraphs` and `sections` arrays, then serializes the model-written headings and paragraphs into the existing plain-text body contract. It never invents headings or relaxes the final section, source, repetition or length gates. Invalid structured fields, missing essay bodies and unparsable JSON use the existing bounded revision retry, then fail closed; valid legacy body-only adapters remain compatible. Verification failures now retain aggregate quality metrics. All 80 focused generation/image regressions pass, including malformed-response recovery and rejection; project checking reports no errors or warnings. A further actual unforced run is required to establish text-generation recovery, not merely successful selection or unit tests.

Second unforced run `37190085543` passed 646 source tests, 22 built tests, 21 content-gate tests and three final audit tests, but text generation stopped at `draft:invalid_structured_heading`. This exposed premature rejection in the new draft parser: a recoverable draft formatting problem never reached the revision passes. The draft path now carries its explicit heading/count feedback into the existing two revision attempts, while the final revision parser remains strict. It preserves the model's original draft wording rather than inventing replacement headings. Regression coverage confirms malformed draft headings can be repaired and cannot publish when both revisions remain malformed. The focused suite now passes 81 tests. A further unforced run is still needed; the new column is not yet reported as generated.

Third unforced run `37191731819` passed 647 source tests, 22 built tests, 21 content-gate tests and three final audit tests. Its essay reached 1,795 words, five sections and 18 paragraphs with passing style, repetition and overlap metrics, demonstrating structural recovery. It was correctly withheld for three unsupported numeric claims (`18 months`, `12 months`, `18 months`). The revision prompt previously ordered every draft number to be preserved while its feedback ordered unsupported numbers to be removed; it also lacked the verified numeric ledger. The repair provides that ledger to every revision, explicitly prioritizes evidence correction, and requests event-based observables instead of invented numeric watch horizons in all passes. No numeric verifier or quality threshold is relaxed. All 82 focused regressions pass, including both successful removal and continued rejection of unsupported timelines. Publication of a new column still requires a successful actual run.

Fourth unforced run `37193402999` passed 648 source tests, 22 built tests, 21 content-gate tests and three final audit tests, but did not produce a new column (`voice:invalid_structured_heading`). Its bot commit `d25a2e1fc6d840dcf5e35c28d5350879ab21a872` was verified READY on the live domain. The retry discarded a parseable but format-invalid revision and returned to the earlier draft with generic feedback. The repair now preserves the latest parseable revision and identifies the exact offending heading in feedback. Every unresolved structured-format issue still blocks publication, even if enough other headings pass. Unparseable responses remain bounded failures.

The new serializer now uses the pre-existing renderer heading grammar instead of its unnecessarily stricter extra word-count/character filter. It normalizes only explicit-heading markdown, dash typography, spacing and initial capitalization, never inventing heading words. Source, numeric, repetition, section-count and length gates are unchanged. All 83 focused regressions pass, including latest-revision preservation, exact heading feedback, benign typography, malformed output and continued rejection when repair fails. Another actual run is required to establish new-column publication; the current total remains 18 columns and three unique registered images.

The latest local content gate passed with zero type-check errors or warnings, a successful build, all 21 gate regressions, and passing public copy, article quality, homepage, feed volume, image and admin-exclusion audits. The two timestamp-only audit report updates are included with this repair.

Independent review found that a legacy body-only reply could otherwise clear unresolved structured-format feedback. A revision following a format failure now must return explicit sections before that failure can be cleared. A focused regression covers the malformed draft and malformed first-revision cases; both remain unpublished if a later body-only reply omits the offending structure. All 84 focused tests pass after the guard.

## Actual generation recovery and editorial correction

Fifth unforced Update News run `37195550658` created column `col_b3a7a5ab60c3b9b1` on 2026-10-04 at 10:31:52 UTC (1,098 generated words, two revision attempts). It passed 650 source tests, 22 built tests, 21 content-gate tests and three audit tests. The resulting bot commit `582e8803b3401c6878f6f93b8d045edd29d0f127` was verified READY on the actual production domain. `authored.lastColumnAt` advanced and `authored.lastFailure` cleared. This is actual text-generation recovery, not merely a green job with no new column.

Manual source review found an important residual failure that the automated numeric checks did not detect: the generated title and passages presented a proposed EU rating scheme as an existing heat-reuse permit condition. The full European Commission announcement was retrieved directly in a browser and compared with the stored extraction. The announcement describes a delegated rating regulation under Parliament/Council scrutiny and a separate consultation on minimum performance standards; it does not establish the universal permit condition asserted by the draft. The new column was editorially corrected, keeping its existing ID and URL rather than generating a duplicate. Its revision history and `editorialReview` record preserve the distinction between the Actions draft and the source-reviewed correction.

The final title is **EU data center ratings could make heat reuse a commercial test**. Reported facts, prospective buyer behavior and hypothetical approval consequences are now explicitly separated. Independent review prompted conditional wording in the headline, fuller policy-status context and descriptive image alt text. The corrected article passes the existing authored checks at 1,185 words, five sections and 17 paragraphs, with zero flagged unsupported numeric claims and repeated sentences. These metrics supplement the source review; they are not a semantic guarantee. All three model stages now explicitly forbid inventing policy obligations, and every voice revision receives the canonical source text and facts as well as the numeric ledger. The existing automation and Mac instructions now explicitly require nonnumeric source-fidelity review. All 84 focused generation/image regressions pass after the source-context change. No additional model call, provider, key, forced column or reduced gate was introduced.

The new column has its own freshly generated native image of a data-center heat exchanger, supply/return pipes and nearby housing. The actual returned file was visually reviewed, including the thumbnail crop, with no readable text, logo or watermark. The same newly generated source was re-registered only for this same unpublished image change after the headline copyedit; it was not taken from another article or shared library.

- Native file: `/Users/josh/.codex/generated_images/019dc517-a381-7733-b96f-477dbe23124b/exec-430810f3-19a0-42c9-a669-f3dd5d00b9ac.png`.
- Final fingerprint: `7e316eba6ce0e8a0b47b733d5f2c4b7dd92746d23d5c14c6cd5f066b7ab52339`.
- Unique source hash: `5121bfe370af61fe0be303912bf2720e0a67c479f1a1efdd41112b057bc6a392`.
- Hero: `public/generated/articles/col_b3a7a5ab60c3b9b1-eu-data-center-ratings-could-make-heat-reuse-a-commercial-test/hero.webp`.
- The ID-specific queue is empty with zero pending or blocked jobs; the source and hero/thumbnail/OG/legacy variants exist. There are now 19 columns, four valid unique registrations, and 15 unchanged source-evidence holds.

The final post-review content gate passed on 2026-10-04 at 11:06 UTC: zero type-check errors or warnings, successful build, 21 gate regressions, all public copy/quality/homepage/feed/image audits, and no private-artifact leaks. Final live HTTP, asset-hash and viewport checks follow the deployment of this correction and its artwork; those are not inferred from local tests.

### Native image prompt

Use case: stylized-concept, realistic editorial infrastructure illustration. Asset: a NEW original wide landscape 16:9 hero image for Compute Current column 'EU data center ratings make heat reuse a commercial test, not a permit gate'. Show a credible modern European data center heat-recovery plant integrated with a district heating system: central large stainless-steel plate heat exchanger and paired insulated supply/return pipes with realistic valves; through glass on the left a clearly recognizable server hall; pipes lead toward a modest utility building and low-rise European apartment blocks visible on the right. Show the physical thermal connection as an illustrative possible arrangement, not documentary evidence of any actual project. Bright neutral daylight, accurate materials and clean industrial detailing, muted steel with green and red utility accents. Wide professionally composed editorial rendering; central equipment remains legible in both 16:9 and 4:3 crops. Fresh composition, do not reuse any past image or existing thumbnail. No people, no flags, no logos, no words, no numbers, no readable labels, no overlays, no arrows, no watermarks, no fake certificates or approval stamps. No decorative bokeh or gradients.
