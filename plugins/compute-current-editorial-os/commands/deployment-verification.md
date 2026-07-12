---
description: Verify Compute Current release readiness, production surface, cache state, and release gates.
---

# Deployment Verification

Use `compute-current-sre` and `compute-current-security`. Do not purge caches or perform production actions unless that is explicitly requested.

## Commands
- `npm run check`
- `npm run build`
- `npm run content:gate`
- `node scripts/verify-production-surface.mjs`
- `npm run purge:deployment-cache`
