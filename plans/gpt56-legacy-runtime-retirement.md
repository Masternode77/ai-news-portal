# GPT-5.6 Legacy Runtime Retirement

## Goal

Leave one executable production content engine: `scripts/content-command-surface.mjs`
composed by `src/adapters/content-cycle-composition.mjs`. Preserve useful legacy
behavior only as test fixtures, diagnostics, or bounded providers on the canonical
production graph.

## Behavior Locks

- Extend `tests/command-surface-contract.test.mjs` before runtime edits.
- Every legacy mutating command must be a thin `runLegacyContentCommand` wrapper.
- No runtime script may import the legacy fixture-cycle helper.
- The independent `public-feed-regenerator.mjs` writer must not remain in `scripts/lib`.
- Existing fixture routing tests keep their assertions after the helper moves under
  `tests/helpers`.
- Canonical commands, workflow invocation, fail-closed publication, image generation,
  and public read-model tests must remain green.

## Reviewable Steps

- [x] Add failing command-surface assertions for all remaining mutation entrypoints.
- [x] Move the old fixture cycle from `scripts/` to `tests/helpers/` and update tests.
- [x] Convert scheduled, feed-regeneration, cleanup, quarantine, and missing-image
      entrypoints to canonical compatibility wrappers.
- [x] Delete the now-unreachable independent public-feed writer.
- [x] Re-run targeted command, fixture, public output, image, and content-cycle tests.
- [x] Update the legacy map, acceptance matrix, final report, and `.codex/NEXT.md`.
- [x] Run full test, check, build, content gate, dependency audit, and independent review.
- [x] Commit with a Lore message and verify an exact-commit preview only.

## Files Likely To Change

- `tests/command-surface-contract.test.mjs`
- `tests/helpers/content-cycle-fixture.mjs`
- `tests/content-cycle.test.mjs`
- `tests/content-cycle-routing.test.mjs`
- `scripts/run-content-cycle.mjs`
- `scripts/schedule-content-cycle.mjs`
- `scripts/regenerate-public-feed.mjs`
- `scripts/regenerate-longform-analysis.mjs`
- `scripts/regenerate-brief-cards.mjs`
- `scripts/emergency-cleanup-public-content.mjs`
- `scripts/quarantine-low-quality-content.mjs`
- `scripts/generate-missing-images.mjs`
- `scripts/lib/public-feed-regenerator.mjs`
- `docs/gpt56-legacy-engine-map.md`
- `docs/gpt56-final-acceptance-matrix.md`
- `docs/final-gpt56-upgrade-report.md`
- `.codex/NEXT.md`

## Risks And Rollback

- Legacy command names may now run the full canonical cycle or require its checkpoint;
  wrappers must name the canonical target in their receipt.
- Test-fixture imports can break after relocation; targeted fixture tests run first.
- Removing the independent feed writer is reversible as one commit and does not alter
  current tracked article data.
- No production deployment, production secret, cache purge, or push is part of this
  cleanup. Rollback is `git revert` of the local cleanup commit.
