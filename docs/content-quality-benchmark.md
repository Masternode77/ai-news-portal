# Content Quality Benchmark

Updated: 2026-07-12

## Current Evidence

The repository's executable quality suite currently covers extraction failure, strict
infrastructure routing, taxonomy, source fidelity, unsupported claims, article length,
anti-template language, repeated openings, homepage eligibility, and safe downgrade to a
source-linked signal. The full test run ran 418 tests: 417 passed, none failed, and one
intentional skip; the standalone quality, relevance, taxonomy, and repetition commands also passed.

The historical stores contain 733 records: 30 latest and 703 archived. Of the archived
records, 562 are marked `archive_only`, 112 `signal_card`, one `full_memo`, and 28 predate the
current tier field. These production-derived fields are useful regression evidence, but they
are not an independent human-labeled benchmark.

## Acceptance Status

| Requirement | Status | Evidence |
| --- | --- | --- |
| Generic consumer/AI stories blocked from core | Pass | strict relevance and source-grounded relevance tests |
| Failed longform downgrades safely | Pass | content cycle and public routing tests |
| Repetition and banned formulas blocked | Pass | repetition and anti-template suites |
| Unsupported material claims blocked | Pass | source-fidelity and claim-ledger suites |
| 150 independently labeled historical items | Blocked | no independently reviewed label set exists yet |
| 40 independently labeled writing samples | Blocked | no independently reviewed writing set exists yet |
| Precision, recall, FPR, route and category metrics | Blocked | metrics would be circular if derived from current generated labels |

## Release Gate

Do not quote a sub-5% false-positive rate from the current archive metadata. Before production
cutover, create a versioned, reviewer-labeled sample with the requested classes, keep labels
separate from classifier output, and publish the confusion matrix plus route/category metrics.
This is an editorial review task rather than a credential blocker.
