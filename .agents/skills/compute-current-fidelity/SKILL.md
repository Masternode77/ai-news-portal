---
name: compute-current-fidelity
description: Use when checking Compute Current generated copy against source text, close-copy risk, unsupported claims, or source-fidelity publishing gates.
---

# Fidelity

Use this skill before marking generated article copy safe.

## Canonical Rules
- Generated claims must be traceable to source text, snippets, metadata, or corroborated evidence.
- Copyright-safe copy must not closely reuse source paragraphs.
- Missing support blocks publication instead of inviting filler.

## Workflow
1. Extract article claims and match each to source evidence.
2. Check numeric claims and quoted or near-quoted language.
3. Run source-fidelity and copyright-safe tests.

## Useful Commands
- `node --test tests/source-fidelity-claim-check.test.mjs tests/copyright-safe-copy-guard.test.mjs tests/unsupported-claim-guard.test.mjs`
- `npm run test:claim-ledger`
- `npm run eval:articles`
