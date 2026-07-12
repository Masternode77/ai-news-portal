---
name: compute-current-relevance
description: Use when judging or changing Compute Current AI infrastructure relevance, lane routing, archive-only decisions, or product-fit boundaries.
---

# Relevance

Use this skill to keep Compute Current focused on AI infrastructure decision-support.

## Canonical Rule
Every qualifying item should answer what changed, why it matters for AI infrastructure, who benefits, who is exposed, and what bottleneck to watch.

## Workflow
1. Check whether the source is about capacity, power, chips, cloud deployment, data centers, cooling, financing, policy, or adjacent constraints.
2. Keep weak consumer/model/app news out of forced infrastructure framing.
3. Preserve archive-only or signal-only treatment for low or adjacent relevance.

## Useful Commands
- `npm run test:relevance`
- `node --test tests/strict-infrastructure-relevance-router.test.mjs tests/source-grounded-public-relevance.test.mjs`
- `npm run test:quality-gates`
