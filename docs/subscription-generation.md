# Subscription generation on the Mac

## Model ownership

Text generation defaults to `LLM_PROVIDER=subscription`. It invokes the official,
locally logged-in CLIs; it does not send subscription credentials to GitHub,
Vercel, OpenRouter or a custom proxy. Legacy OpenRouter code is an explicit
operator-selected mode only, never an automatic fallback.

| Work | Execution | Model |
| --- | --- | --- |
| Story selection | Codex CLI | `gpt-6-astra`, medium reasoning |
| Summary, classification, tags, analysis comments | Codex CLI | `gpt-6-astra`, medium reasoning |
| General long-form analysis | Codex CLI | `gpt-6-astra`, medium reasoning |
| The Current thesis, draft and editing | Claude Code | `claude-fable-5-1`, high effort |
| The Current source brief and independent final source-fidelity review | Codex CLI | `gpt-6-astra`, medium reasoning |
| Image prompt text | Codex CLI | `gpt-6-astra`, medium reasoning |
| Actual artwork | Existing Mac Codex task's native image tool | Use the model reported by the tool; no API substitute |

Old `OPENROUTER_MODEL`, `CURATION_MODEL`, `EXPERT_LENS_MODEL`, and
`AUTHORED_COLUMN_MODEL` settings do not choose subscription models. Model pins
live in `scripts/lib/subscription-provider.mjs`. Unsupported models, expired
sessions, quota errors and malformed replies stop generation; no cheaper model
or paid API is selected automatically. Offline tests remain offline.

Before Fable drafts a column, Astra supplies one bounded source-specific brief.
Each finding cites a known source URL and an exact source excerpt; malformed or
unverifiable briefs stop before drafting. The brief separates reported facts,
aggregate measurements, group-specific measurements and motivating use cases.
It guides drafting and repairs, but the original source remains authoritative.
The final Astra review does not receive the brief, so it independently checks
the completed prose and figures against the original evidence.

Column editing allows at most three evidence-reviewed versions, with two
format/quality attempts per version. A completed Astra rejection is required
to open another version; deterministic exhaustion alone does not replenish the
budget. After review, Fable returns exact block replacements rather than a
whole-body rewrite. Each replacement must pass the same source, numeric,
repetition and prose checks before a fresh Astra review. Current summary-heavy
sentences are supplied as repair diagnostics without changing the scoring
thresholds. A third rejection, authentication failure or transport failure
leaves the column unpublished.

Publication stance comes from the current headline and deck, never an abandoned
planning hypothesis. Astra checks the rendered figure copy and numbers as well
as the prose. Nonnumeric fact rows preserve the complete verified statement,
including qualifiers, instead of cutting it at a display-character limit.
Model evidence excludes the older template-based expert-insight
fields; source text, source metadata and verified claims remain available.

## One-time Mac activation

This repository change does not install or update an app-local schedule. The
original Windows implementation could not attest to the Mac prerequisites;
the Mac follow-up verification is recorded separately in
[subscription-mac-verification.md](subscription-mac-verification.md). Keep the existing Mac task;
do not create a duplicate Windows task or copy authentication files to CI.

1. Finish the reviewed Git change and make it available on `main` through the
   authorized release process. Keep existing uncommitted Mac work intact. Follow
   the clean-checkout refresh and production comparison in
   [mac-column-image-automation.md](mac-column-image-automation.md).
2. Use Node 22 from `.nvmrc`, install project dependencies with `npm ci`, and use
   current Codex and Claude Code installations supporting the required CLI flags.
3. On the Mac, run `codex login` with ChatGPT and `claude auth login` with the
   subscription account. The provider checks their status through official CLI
   commands and requires Claude Max for included Fable use. It does not read or
   export raw tokens. No API key is needed.
4. Check account billing controls: disable extra usage / automatic credit spend
   in both products if generation must stay within included subscription usage.
   The CLI cannot independently prove these account settings. Only after this
   check, set `SUBSCRIPTION_INCLUDED_USAGE_CONFIRMED=1` in the existing Mac task's
   process environment. This is an operator acknowledgement, not a quota reading.
5. Run `node scripts/run-subscription-news.mjs --check`. This checks prerequisites
   without generating an article. A failed check must be resolved before the
   schedule is switched. `--dry-run` only describes execution and does not verify
   authentication or generate content.
6. Update the existing Mac Codex automation, using the Codex automation tool on
   that host, to follow the run instructions below. Preserve its authorized
   publication scope and existing schedule. The current Mac task runs at 00:45,
   08:45 and 16:45 KST; the retired GitHub generation ran at 00:05, 08:05 and
   16:05 KST. Reconcile the image-only and retired text paths into the one Mac
   task so they cannot create a second text generation job. This document creates no timer.

GitHub's `update-news.yml` is now read-only validation on pushes to main and
manual dispatch. It has no generation schedule, API secrets, commit or push.
The monthly OpenRouter model-refresh schedule is retired. Coordinate merging
these workflow changes with Mac activation to avoid an unattended publishing
pause. Validation success is not a generation heartbeat. The existing Vercel
Git integration remains unchanged; its deployment may start independently of
Actions, so all local gates must pass before an authorized push.

## Instructions for the existing Mac Codex task

Refresh and verify the production baseline as described in the Mac image
workflow. Check that no other task is modifying this checkout. Run:

```sh
node scripts/subscription-operation-lock.mjs acquire
CC_SUBSCRIPTION_LOCK_OWNER='<owner-token-from-acquire>' node scripts/run-subscription-news.mjs --check
CC_SUBSCRIPTION_LOCK_OWNER='<owner-token-from-acquire>' node scripts/run-subscription-news.mjs
```

Acquire this operation lock before refresh or generation and keep the same owner
exported until native artwork/import, final validation, heartbeat and any
authorized commit/push all finish. The lock lives in the repository's common Git
directory, so linked worktrees cannot become a second writer. The runner verifies
the exported owner and leaves an outer lock in place; without an outer owner it
takes and releases a runner-only lock for interactive use. In Codex App, retain
the owner printed by `acquire` and pass it explicitly to every runner command;
each command uses a separate shell, so an `EXIT` trap in the acquisition command
would release too early. A wrong owner cannot release the lock, and the tooling
never removes a stale lock automatically. If a job is interrupted, first verify
that all of its processes have stopped before performing any manual recovery.

The runner forces subscription generation, disables external archive writes and
runs the pipeline, radar refresh, approved inventory restoration, taxonomy
rebuild, audits, tests and the content gate. It never commits or pushes. On
failure, keep local diagnostic/output changes for inspection and report the
blocker; do not publish partial work or record success. Do not reset or stash
another task's changes. Configure only the existing Mac automation to own this
sequence; do not leave an image-only or legacy text job that can overlap it.

After successful text generation, complete native artwork using
`docs/mac-column-image-automation.md` and the existing image skill. Each new
column gets its own new illustration. Review the actual source assertions and
image before import. A pending or blocked image is not completed artwork.
Re-run `npm test` and `npm run content:gate` after image imports, synchronize
`node scripts/audit-omo-ultra-current-state.mjs`, then check its test. Only after
all required generation, review and validation succeeds, record:

```sh
node scripts/record-pipeline-heartbeat.mjs ok
```

Keep the operation lock held while recording this heartbeat and through the
authorized push. After every authorized operation is complete, release it
explicitly in the final command:

```sh
CC_SUBSCRIPTION_LOCK_OWNER='<owner-token-from-acquire>' node scripts/subscription-operation-lock.mjs release
```

Use an `EXIT` trap only in a genuinely long-lived shell that remains active
across the native image tool and every later step.

Commit/push only within the existing task's explicit authorization. Include all
related artifacts in the same validated change: article arrays, archive/search,
pool and state, `src/data/taxonomy-pages.json`, `docs/taxonomy-pages-report.md`,
`docs/omo-ultra-audit.md`, `src/data/pipeline-heartbeat.json`, the image manifest
and generated artwork/variants. Inspect the actual diff; never stage unrelated
work. If upstream advances, stop the push and reconcile/revalidate the candidate;
never force-push or silently overwrite it.

A no-qualifying-story result is a valid editorial outcome, not permission to
force a column or relax source rights, extraction, repetition or fidelity gates.
The previous `longform_count_below_quality_pool:4/5` incident remains a separate
data/quality issue; model migration does not bypass or claim to repair it.

## Verification limits and references

Authentication status and fixture tests do not prove real Astra/Fable inference
on the Mac. Before unattended activation, generate a representative article with
publication held, verify model access, source fidelity, structured outputs,
unique artwork and the full content gate. A Windows missing-Claude failure is
not evidence that the disconnected Mac lacks Claude.

- [Codex non-interactive execution](https://learn.chatgpt.com/docs/non-interactive-mode)
- [Codex authentication](https://learn.chatgpt.com/docs/auth)
- [Claude Code CLI reference](https://code.claude.com/docs/en/cli-reference)
- [Claude Code model configuration](https://code.claude.com/docs/en/model-config)
