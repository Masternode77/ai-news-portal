# AI News Portal QA/QC Runbook

This runbook defines the reusable QA/QC gate for the `ai-news-portal` repository and the Compute Current public product surface.

## Scope

QA/QC covers three simultaneous questions:

- Release readiness: whether the current branch is safe to deploy.
- Merge audit: whether conflicted or generated data surfaces remain internally consistent.
- Reusable quality system: whether future runs can repeat the same checks without relying on private operational credentials.

## Verdict Taxonomy

- `deployable`: local gates pass, merge/data integrity passes, local distribution passes, live verification passes, and no secret-gated operational follow-up remains.
- `deployable with operational follow-up`: local gates pass, merge/data integrity passes, and the built local artifact passes, but live deployment, staging, or cache freshness still needs operator action.
- `blocked`: local gates fail, merge/data integrity fails, or local distribution verification fails.

## Required Local Gate

Run:

```bash
npm run qa:qc
```

The command composes:

- `npm run content:gate`
- JSON parse checks for `src/data/latest-news.json`, `src/data/archived-news.json`, and `src/data/search-index.json`
- unmerged-path detection with `git diff --name-only --diff-filter=U`
- production-surface verification against the local `dist` artifact and optional live URL

`--skip-content-gate` is only for reusing a separately captured local-gate result during iterative QA. A skipped content gate is reported as `skipped`, adds an operational follow-up, and must not be treated as an unconditional release pass.

## Non-goals

- Do not require production secrets.
- Do not execute cache purge.
- Do not weaken extraction QA, repetition checks, source-fidelity checks, public-content gates, or product-fit boundaries.

Cache purge status must be recorded as an operational follow-up unless a separate operator run explicitly supplies credentials and authorizes purge with an explicit opt-in flag such as `--purge-cache`.

## Merge Audit Checklist

- No unmerged paths remain.
- Public data JSON parses cleanly.
- RSS local article links point to generated local files.
- Sitemap entries do not include hidden, noindex, admin, dashboard, or legacy conversion paths.
- Thin or dirty-source items are not promoted into local longform article routes.

## Release Checklist

1. Run `npm run qa:qc`.
2. Confirm the report verdict is not `blocked`.
3. If the verdict is `deployable with operational follow-up`, verify the follow-up list is limited to deployment, staging, live freshness, or cache status.
4. Commit local docs/scripts/tests/data changes after verification.
5. Push or deploy only after a separate explicit instruction.
