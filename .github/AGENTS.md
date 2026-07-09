# GitHub Workflow Instructions

## OVERVIEW

`.github/` contains scheduled content refresh and visual QA automation for Compute Current.

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| Scheduled content refresh | `.github/workflows/update-news.yml` | Runs check, pipeline, dashboard sync, build, then commits refreshed artifacts. |
| Visual QA | `.github/workflows/visual-qa.yml` | Installs browser tooling dynamically and uploads visual artifacts. |
| Build contract | `package.json`, `vercel.json` | Workflows and Vercel share `npm run build`. |
| Deployment runbooks | `docs/deployment-checklist.md`, `docs/automation-runbook.md`, `docs/qa-qc-runbook.md` | Use docs when changing cadence or release evidence. |

## CONVENTIONS

- Scheduled workflow times are KST-aligned; keep UTC cron comments and expressions in sync.
- Commit-back paths are intentional for refreshed JSON/dashboard/image artifacts.
- Use package scripts instead of duplicating shell logic in workflow YAML.
- Keep secrets optional where scripts already support offline or skipped behavior.

## ANTI-PATTERNS

- Do not commit `dist/`, `evidence/`, `artifacts/`, logs, or secret material from workflows.
- Do not treat Vercel deploy hooks as cache purge endpoints.
- Do not add workflow steps that publish content without running the quality gates expected by package scripts.
- Do not make visual QA depend on a local Playwright config file; this repo uses script-managed Playwright.
