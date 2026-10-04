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

The other 15 legacy replacements remain editorial holds: their current stored sources lack valid authorized extraction artifacts. They are not reported as completed or silently dropped. Recovering authorized, source-faithful evidence is separate from generating an illustration; this repair does not invent permissions or reconstruct provenance from unverified legacy text.

## Automation and verification

The existing `compute-current` heartbeat remains active on the same schedule and production target. It now reads the correct `authored` state, handles blocked jobs without stopping ready work, distinguishes pending from completed images, and reports a new 72-hour column stall once rather than treating repeated selection emptiness as indefinite health. No new provider, API key, credential export, source licence, force option or schedule was introduced.

Before the final review fixes, the full suite passed 643 source tests, 22 built tests, build, quality, relevance, taxonomy and repetition checks. After those fixes, all 77 focused generation/image regressions passed. The final production content gate also passed: type checking reported no errors or warnings, 93 pages built, 21 gate regressions passed, and the public output, copy, article quality, homepage, feed, image and admin-exclusion audits passed with no broken images. The EIA column's registration is valid and unshared, all four source/variant files decode as WebP, and its ID-specific queue has zero pending or blocked jobs.

Production deployment and a real unforced Update News run are still to be verified; these are not inferred from unit-test success.
