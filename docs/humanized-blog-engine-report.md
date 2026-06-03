# Humanized Blog Engine Report

Generated at: 2026-05-31T08:00:00.000Z

The blog engine now routes items through infrastructure-fit policy, length policy, anti-template checks, claim/source-fidelity guards, and content-cycle execution before an item can appear as a public longform article or brief signal.

## Commands Run

- `node --test tests/blog-engine-v4.test.mjs tests/blog-length-policy.test.mjs tests/anti-template-guard-v2.test.mjs`
- `node --test tests/source-fidelity-claim-check.test.mjs tests/content-cycle.test.mjs tests/content-cycle-routing.test.mjs`
- `npm run content:cycle`
- `npm run content:gate`
- `npm run check`

## Artifacts

- Content cycle log: `evidence/compute-current-omo-ultra-rebuild/task-12-cycle.log`
- Routing assertions: `evidence/compute-current-omo-ultra-rebuild/task-12-cycle-assertions.json`
- Legacy migration report: `docs/legacy-migration-report.md`
- Public QA report: `docs/public-qa-report.md`
- Main modules: `scripts/lib/blog-engine-v4.mjs`, `scripts/lib/graded-publishing-router.mjs`, `scripts/lib/anti-template-diversity-guard.mjs`

## Pass/Fail

- Passed: content-cycle fixture produced routed outputs without publishing low-relevance consumer/gaming/wearable items into the core infrastructure feed.
- Passed: rendered public-output audit found no clipped source fragments, repeated template failures, or broken public images in the sampled build.
- Passed: latest eligible migration assigned regeneration actions and image readiness without leaving missing article images.

## Remaining Risks

- Live generation with paid model credentials still needs a credentialed staging run before enabling unattended production writes.
- Source extraction must remain fail-closed; weak extraction should hide/noindex or brief an item rather than fabricate longform analysis.
- New prompt changes should be paired with repetition and source-fidelity tests before publishing.

## Cleanup Receipts

- Content-cycle QA used `.cache/content-cycle` as its local output area and recorded assertions in evidence.
- No tmux or dev-server resource is required to preserve the blog-engine evidence.
- Migration and regeneration reports are retained as release artifacts rather than temporary QA debris.
