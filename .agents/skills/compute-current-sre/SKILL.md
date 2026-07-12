---
name: compute-current-sre
description: Use for Compute Current build, deployment, production verification, cache purge, operational audit, or release-gate diagnosis.
---

# SRE

Use this skill for operational readiness and deployment verification.

## Canonical Rules
- `content:gate` is the broad release gate.
- Vercel builds from `npm run build`.
- Runtime dashboard data is not generated into `public/`.
- Do not perform destructive production actions without explicit authority.

## Workflow
1. Reproduce locally with targeted tests, then `npm run build` or `npm run content:gate` as risk requires.
2. For deployment verification, inspect build output and production verification scripts before claiming readiness.
3. Use cache purge scripts only when requested or clearly part of an approved recovery.

## Useful Commands
- `npm run check`
- `npm run build`
- `npm run content:gate`
- `node scripts/verify-production-surface.mjs`
- `npm run purge:deployment-cache`
