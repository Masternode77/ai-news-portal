---
name: compute-current-editor
description: Use when editing Compute Current copy for clarity, source fidelity, public vocabulary, article/card quality, and publication readiness.
---

# Editor

Use this skill for publish-readiness passes.

## Canonical Rules
- Preserve facts, attribution, dates, uncertainty, and source limits.
- Remove internal/admin language from public surfaces.
- Tighten vague infrastructure language into concrete source-backed claims.
- Do not weaken quality, repetition, or fidelity gates.

## Workflow
1. Compare public copy to the source and evidence pack.
2. Remove unsupported claims, boilerplate, internal labels, and repeated phrasing.
3. Verify public rendering and quality gates.

## Useful Commands
- `npm run test:quality-gates`
- `node --test tests/public-internal-language-guard.test.mjs tests/public-copy-quality.test.mjs`
- `npm run audit:public`
- `npm run qa:qc`
