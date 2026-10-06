# Mac subscription verification — 2026-10-06

## Scope and release state

Worktree: `/Users/josh/Documents/compute-current-subscription`, branch
`feat/subscription-astra-fable`. The remote feature head `1fcd7023` was merged
with production/main `cb3ccc8370eb990c8e2f35b9a93587464bc885ef` in local merge
`be43543d`. Vercel's READY deployment for `www.computecurrent.com` confirmed
that production baseline. The original main checkout remained clean.

Operational activation remains conditional on a complete unpublished generation,
source review and native artwork verification. The existing Mac automation,
GitHub production workflows and OpenRouter configuration have not been changed.
No test article was saved to the public collections, committed or published.

## Verified runtime prerequisites

- Host: `Joshui-Macmini.local`; Node 22.22.0.
- Codex CLI updated from 0.144.6 to 0.160.1 after Astra explicitly rejected
  the older client. ChatGPT subscription login and an actual `gpt-6-astra`
  response succeeded.
- Claude Code 2.1.261: the user completed the official browser login;
  `claude auth status` confirmed claude.ai/firstParty/Max. An actual
  `claude-fable-5-1` response succeeded.
- The user confirmed that extra paid usage and automatic credit spending were
  disabled on both accounts. This is a user acknowledgement; the CLI does not
  independently verify account billing settings.
- Preserve `USER` in the isolated child environment for macOS Keychain lookup.
  Force `CLAUDE_CODE_DISABLE_TERMINAL_TITLE=1` to avoid the background title
  model request. The exclusive Fable model-usage check remains enforced.
  This flag is documented in the [official Claude Code environment reference](https://code.claude.com/docs/en/env-vars).
- `SUBSCRIPTION_INCLUDED_USAGE_CONFIRMED=1 node scripts/run-subscription-news.mjs --check`
  passed. Child environments exclude API keys and archive write credentials.
- Existing power settings report sleep 0 and autorestart 1; an existing
  caffeinate process prevents sleep. No power settings were changed.

## Unpublished generation evidence

Actual Astra enrichment of Kubernetes Blog's
“Scaling Kubernetes Workloads with Node Swap” succeeded under the strict
generated-field schema. Saved extraction QA was 1 with no blocking reasons.
Evidence: `evidence/subscription-mac-2026-10-06/enrichment-trial.json`.

Fable authored a complete draft and Astra independently rejected unsupported
causal and numeric assertions. The engine now feeds bounded review feedback
into its existing second editing attempt, then reruns every deterministic gate
and requests a fresh Astra review. Repeated rejection and transport/auth/quota
errors remain fail-closed. A subsequent revision failed the deck-length gate;
the repair prompt now explicitly preserves the headline and deck limits.

Repair trials replayed the exact matching previously captured first four model
responses, then made fresh Fable editing calls and, when deterministic gates
passed, a fresh Astra review call. These are
actual model outputs, but are not represented as six freshly executed calls.
The replay wrapper refuses any changed prompt. No native artwork was generated
for a rejected column.

The final representative trial returned
`generated:false, failure:verify:invalid_structured_heading` before a second
Astra review could run. Evidence: `trial-result.json`,
`trial-model-responses.json` and
`/tmp/compute-current-subscription-length-repair-trial.log`.
Earlier revisions and reviews are preserved under distinct filenames in
`evidence/subscription-mac-2026-10-06/`. The full column/artwork end-to-end path
has not passed; activation and OpenRouter disablement remain blocked by that
quality condition. No acceptance criteria were weakened.

## Duplicate prevention and automation preparation

The operation lock uses the common Git directory across checkouts and an
unpredictable owner token. It covers generation, native image generation,
import, validation, heartbeat and the existing publication scope. A runner
inside the outer operation leaves that lock held. Unknown owners and stale
locks fail closed; there is no automatic stale-lock removal.

Both concurrent-checkout regression tests and a live second lock acquisition
confirmed rejection of duplicate execution; the owned live test lock was then
released. Evidence: `evidence/subscription-mac-2026-10-06/operation-lock-live.json`.

Only the existing `compute-current` Codex heartbeat was found; no extra cron or
launchctl generation job was found. Its existing daily schedule is 00:45,
08:45 and 16:45 KST. The preserved-before configuration and proposed prompt are
in `automation-before.toml` and `automation-proposed.txt` in the evidence folder.
The proposed prompt preserves the existing task, schedule, target thread,
native artwork procedure and already authorized publication scope. It has not
been applied. GitHub generation retirement likewise requires releasing the
reviewed feature changes; a local branch alone does not disable the live job.

## Validation

- Full `npm test`: 779 source tests and 22 built-page tests passed, plus
  quality, relevance, taxonomy and repetition scripts. Build produced 96 pages.
- `npm run content:gate` passed, including extraction/public-copy, article
  quality, image and rendered public-output checks.
- Astro check: 0 errors, 0 warnings, 25 hints.
- Latest routing regressions: 22/22 passed after the repair-length instruction.
- Final focused provider/routing/runner/operation-lock/monitor/workflow/docs/audit
  regression check: 59/59 passed.
- Independent code review approved with no remaining code findings. Runtime
  activation remains a separate unmet condition until the live trial succeeds.

Machine-local model responses and command logs are retained in the ignored
evidence folder and `/tmp/compute-current-subscription-*.log`; credentials were
not copied into those artifacts. The earlier Windows verification report is
historical and is not substituted for these Mac checks.
