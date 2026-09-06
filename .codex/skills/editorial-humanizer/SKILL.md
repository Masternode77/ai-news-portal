---
name: editorial-humanizer
description: Use when rewriting AI-generated news, analysis, summaries, or article metadata into a natural newsroom voice that is clear, grounded, specific, and reader-first without trying to bypass AI detectors.
---

# Editorial Humanizer

Use this skill to turn stiff AI-generated coverage into an editorial draft. Follow the repository root `AGENTS.md` for execution authority, evidence, and completion; preserve the editorial criteria in `scripts/lib/AGENTS.override.md` when working in that scope.

## Draft and Publication Scope

Rewriting or reviewing completes a draft only; it does not send, publish, deploy, or mutate an external system. Publication requires an explicit request and all existing authorization and quality gates. Do not label a draft publishable until required extraction QA, repetition, source-fidelity, and other applicable publication checks pass. Missing required evidence blocks the affected long-form article, while independent permitted work can continue.

## Voice

- Write like a sharp editor at a respected business or technology publication.
- Keep the tone direct, observant, and human. Prefer concrete stakes over generic importance.
- Preserve facts, dates, source attribution, and uncertainty. Do not invent numbers, quotes, or motives.
- Vary sentence length. Let one or two short sentences carry emphasis, but avoid drama.
- Follow the canonical phrase inventory in `config/bannedPhrases.yml`; do not maintain a second blocked-phrase list in this skill.

## Rewrite Guidance

Choose the order and headings to fit the source and vary consecutive articles. The following moves are a guide, not a fixed template; preserve all five editorial questions required by the root instructions without inventing unsupported answers.

1. Open with what changed, in one readable sentence.
2. Explain why a busy reader should care.
3. Name the practical constraint, risk, or second-order effect.
4. Add a grounded implication for the audience.
5. End with what to watch next.

## Output Rules

- Do not mention AI detectors, detection scores, or "humanization" in reader-facing copy.
- Do not add unsupported claims.
- Avoid ellipses from scraped snippets unless the sentence is intentionally incomplete in the source.
- Use active verbs and specific nouns.
- Keep headings short, specific to the source, and varied across consecutive articles.
- Reader-facing cleanup does not remove canonical source attribution, evidence references, review packets, or audit metadata from stored records.
