# May 19 Baseline Selection

## Selected Baseline

Selected commit: `1758eea2e1d5878f63719877c181907eeb8ecbcf`

Commit subject: `Record production audit evidence for editorial surface v2`

Commit date: `2026-05-17 23:45:11 +0900`

## Why This Commit

`1758eea2` is the last foundation commit before the monetization and lead-capture sequence starts at `640840df`.

It preserves the stable foundation requested for the reset:

- Content pipeline audit: `docs/content-pipeline-map.md`
- Editorial standards: `AGENTS.md`
- Source extraction and completeness QA primitives
- Infrastructure relevance classifier: `scripts/lib/relevance-classifier.mjs`
- Basic public quality gate: `scripts/lib/quality-gate.mjs`
- Archive/homepage routing primitives, including `scripts/lib/public-lane-router.mjs`

## Invalidated Later Work

The rollback invalidates product work after the baseline, including:

- Monetization, sponsorship, pricing, lead capture, and subscriber surfaces starting at `640840df`
- Newsletter and subscription capture paths introduced after the baseline
- Large source expansion and post-baseline generated refreshes
- Autonomous/editorial desk work in `22fd44ca`
- `editorial-blog-writer-v2` and launch-ready surface work in `050acf3f`
- Debug/schema public phrases introduced in the launch-ready/editorial-v3 sequence
- Generated AWS Weekly Roundup fixture data used after the baseline

Generated runtime data was cleaned after restoring the baseline so AWS roundup records and debug phrases do not remain active in public output.

## Foundation Remaining

The rollback intentionally keeps only foundation-level editorial infrastructure and QA. It does not add humanization, monetization, newsletter, source expansion, or launch-ready features.
