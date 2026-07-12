---
name: compute-current-evidence
description: Use when building or auditing Compute Current evidence packs, claim ledgers, numeric claims, stakeholder impacts, watch metrics, or source-backed facts.
---

# Evidence

Use this skill when article claims need explicit support.

## Canonical Rules
- Claims must be supported by extracted source text, feed snippet, or explicit source metadata.
- Do not invent numbers, motives, winners, risk exposure, or operational bottlenecks.
- Prefer concrete source facts over reusable framing.

## Workflow
1. Inventory source facts, numeric claims, stakeholders, layer, and watch metrics.
2. Link article claims to evidence or mark them unsupported.
3. Fail closed when support is missing.

## Useful Commands
- `npm run test:claim-ledger`
- `node --test tests/evidence-pack-builder-v2.test.mjs tests/unsupported-claim-guard.test.mjs`
- `npm run eval:articles`
