# Test Suite Hermeticity Cleanup

## Problem

The full suite currently reports one environment-gated skip for a rendered-build contract. Release
audits also need a mechanical guarantee that tests do not silently rewrite tracked reports or source
files.

## Constraints

- Preserve every existing assertion and quality gate.
- Add no dependency and change no production runtime behavior.
- Support an already-dirty developer worktree by comparing tracked bytes before and after the run,
  rather than requiring a clean starting state.
- Build the public site before exercising build-backed contracts.

## Steps

1. Add a regression contract for a single hermetic full-suite runner, mandatory `PUBLIC_BUILD_DIR`,
   sequential gate execution, and tracked-worktree comparison.
2. Replace the rendered-build test skip with a fail-closed build-directory precondition.
3. Make the rendered public audit read-only by default; require `--out` for a persisted report.
4. Route `npm test` through the runner: snapshot tracked diff, build, run all Node tests with the
   build path, run the four editorial gates, and compare the final tracked diff.
5. Run the targeted contract, full suite, Astro check, dependency audit, and `content:gate`.
6. Confirm zero failures, zero skips, and no tracked changes beyond this reviewed patch.

## Rollback

Revert the runner, package command, test precondition, and contract together. No data migration or
runtime rollback is required.
