---
name: compute-current-diversity
description: Use when auditing Compute Current article repetition, repeated structures, banned patterns, fallback copy, voice variation, or homepage/archive diversity.
---

# Diversity

Use this skill to prevent template-like coverage.

## Canonical Rules
- Consecutive generated items must vary structure, opening move, paragraph rhythm, and analytical angle.
- Do not add reusable fallback language.
- Keep banned generic phrases in `config/bannedPhrases.yml`, not duplicated in prompts.

## Workflow
1. Compare recent article openings, decks, section shapes, and repeated phrases.
2. Prefer deletion or source-specific rewriting over new generic variants.
3. Verify repetition and public template guards.

## Useful Commands
- `npm run test:repetition`
- `node --test tests/anti-template-guard-v2.test.mjs tests/voice-variation-engine.test.mjs tests/public-template-phrase-guard.test.mjs`
- `npm run test:quality-gates`
