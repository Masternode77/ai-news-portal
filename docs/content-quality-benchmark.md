# Content Quality Benchmark

Updated: 2026-07-12

## Current Evidence

The repository's executable quality suite currently covers extraction failure, strict
infrastructure routing, taxonomy, source fidelity, unsupported claims, article length,
anti-template language, repeated openings, homepage eligibility, and safe downgrade to a
source-linked signal. The latest full-suite counts are recorded in
`docs/final-gpt56-upgrade-report.md`; the standalone quality, relevance, taxonomy, and repetition
commands also pass.

The historical stores contain 739 records: 30 latest and 709 archived. Of the archived
records, 562 are marked `archive_only`, 112 `signal_card`, seven `full_memo`, and 28 predate the
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

## Independent Review Packet

Generate blind, versioned review packets without exposing current classifier predictions:

```bash
npm run benchmark:prepare
```

This writes ignored artifacts under `artifacts/content-benchmark/`:

- `relevance-review.json`: 150 source snapshots with relevance, route, category, and reason-code labels left empty.
- `writing-review.json`: 40 source/article pairs with seven writing dimensions and acceptance left empty.

Each item carries a SHA-256 source digest; writing items also carry a source-plus-article digest.
The scorer rejects packet tampering, corpus or article drift, incomplete labels, rejected writing
without issue codes, missing human reason codes, or a reviewer who does not attest independence.
After two independent reviewers complete the packets, score them with:

```bash
npm run benchmark:score -- \
  --relevance artifacts/content-benchmark/relevance-review.json \
  --writing artifacts/content-benchmark/writing-review.json
```

The scorer reports the requested core precision, recall, false-positive rate, relevance accuracy,
route accuracy, category accuracy, validated human and prediction reason-code coverage,
generic/consumer core false positives, writing acceptance rate, unsupported-claim count, and
dimension averages. It does not substitute
current generated labels or the deterministic `content:eval` policy oracle for human judgments.

## Release Gate

Do not quote a sub-5% false-positive rate from the current archive metadata. Before production
cutover, have independent reviewers complete the generated packets and retain the scored result.
The relevance gate requires a core false-positive rate below 5%, zero reviewer-tagged
generic/consumer items in core, and complete routing reason-code coverage. The writing gate
requires at least 80% acceptance, zero unsupported-claim items, and a 4/5 or better average in
every dimension. This is an editorial review task rather than a credential blocker.
