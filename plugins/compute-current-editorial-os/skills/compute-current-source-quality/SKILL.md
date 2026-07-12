---
name: compute-current-source-quality
description: Use when evaluating Compute Current source extraction quality, feed health, freshness, source text completeness, or whether a source can support local long-form publication.
---

# Source Quality

Use this skill before treating a scraped or feed item as publishable evidence.

## Canonical Rules
- Failed extraction QA must not become generated long-form local article copy.
- Thin sources can remain source-linked signal cards when contracts allow it.
- Do not weaken extraction QA or source text completeness gates.

## Workflow
1. Inspect source fields: URL, publisher, date, cleaned text, extraction status, failure reason, and canonical image data.
2. Decide whether evidence supports local detail publication or source-linked treatment.
3. Verify with targeted source tests before broad gates.

## Useful Commands
- `npm run test:source-expansion`
- `npm run test:quality-gates`
- `node --test tests/source-text-completeness.test.mjs tests/source-extraction-fail-closed.test.mjs`
- `npm run content:gate`
