# Subscription migration verification — 2026-10-06

Scope: local implementation on `feat/subscription-astra-fable`, based on
`745a5e7e2e5b82bce522ceb51b189645135d8e18`, also observed as the successful
Vercel production commit at the start of this task. No commit, push, deployment,
Mac automation change, paid API request or actual content generation was made.

## Observed checks

- Migration-focused provider/routing/runner/monitor/workflow/report tests: **44 passed**.
- Final source suite using Node **22.22.0**: **765 passed, 4 failed (769 total)**.
- The same four failures reproduce in a separate pristine worktree of the exact
  production commit: admin bootstrap source assertion; synthetic Astro binary
  invocation (`ENOENT` on Windows); checked-in current-state audit byte comparison;
  release workflow newline assertion. These are not cleared by this migration.
- Production build using Node 22.22.0: **passed, 96 pages built**.
- Astro check using Node 22.22.0: **0 errors, 0 warnings, 25 hints**.
- Local runner help/dry-run succeed; invalid argument and absent included-usage
  acknowledgement fail before generation. A before/after hash comparison of
  5,063 content files showed no mutations from these checks.
- `git diff --check` passed.

## Runtime investigation

1. Hypothesis: subscription failure can silently use a paid API or older model.
   Routing tests intercept HTTP and force subscription errors; no API request or
   fallback occurs. Stale legacy model environment variables cannot change pins.
2. Hypothesis: malformed model output can be accepted as deterministic copy or
   unsupported evidence. Tests rejected JSON scalars, missing fields, negative
   reviews, fabricated source quotes, wrong source attribution and an unreviewed
   `200` claim alongside a reviewed `2000` claim. All passed after fixes.
3. Hypothesis: cancellation leaves a CLI consuming usage after lock release.
   Actual nested Node processes exercise shutdown, child disappearance, cleanup
   and nonzero exit without continuation. Caller-owned AbortSignal leaves runner
   cleanup in control. Windows exercises process signal handlers through IPC;
   external POSIX process-group delivery remains a Mac/Linux verification item.

## Independent review

Goal/constraints, context, code quality and security lanes passed after the
identified response-validation and cancellation fixes. Hands-on QA passed safe
CLI scenarios and fixture suites. Its short Astro diagnostic attempts timed out;
the parent subsequently completed the asynchronous Node 22 diagnostic run above.

## Activation limits

This Windows host has Codex 0.160.0 logged in with ChatGPT. Claude Code is not
available here, and no Mac host is connected. CLI fixture tests do not establish
actual Astra/Fable entitlement, inference quality, extra-usage settings, native
image generation, or Mac scheduling. Those remain required before unattended
activation. Follow [subscription-generation.md](subscription-generation.md).

The historical Actions `longform_count_below_quality_pool:4/5` failure involved
runtime-refreshed data; it was not reproduced or claimed fixed here. Existing
quality gates remain mandatory. Retiring GitHub generation must be coordinated
with activating the existing Mac task, or scheduled publication will pause.
