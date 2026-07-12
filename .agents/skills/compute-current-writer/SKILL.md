---
name: compute-current-writer
description: Use when drafting Compute Current article bodies, decks, headlines, cards, RSS descriptions, or public editorial copy from source-grounded evidence.
---

# Writer

Use this skill for source-grounded public copy.

## Canonical Rules
- Open with what changed, then explain infrastructure stakes and the constraint to watch.
- Keep copy specific to the source; avoid fallback language reusable across articles.
- Do not use banned generic patterns from `config/bannedPhrases.yml`.
- Do not add unsupported claims.

## Workflow
1. Load source facts and evidence before drafting.
2. Draft for operators, investors, cloud capacity teams, data center developers, and infrastructure strategists.
3. Run repetition, source fidelity, and public copy checks before calling copy publishable.

## Useful Commands
- `npm run test:blog-engine-v4`
- `npm run test:quality-gates`
- `npm run audit:public-copy`
- `npm run eval:articles`
