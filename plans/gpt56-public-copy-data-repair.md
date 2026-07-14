# GPT-5.6 Public Copy Data Repair

## Problem

The final acceptance matrix marked repeated public formulas as cleared, but the built
RSS feed still contains legacy card-copy fallbacks such as `the practical checkpoint
is`, `the exposed dependency is`, and `ties AI buildout timing to`. Homepage and listing
cards already prefer source excerpts; RSS bypasses that boundary and regenerates the
legacy templates.

## Behavior Locks

- Add the explicitly prohibited phrases from the upgrade brief to the canonical banned
  phrase registry.
- Add regression coverage for RSS and every built reader-visible text artifact, not
  only homepage and local detail pages.
- Require signal-card summaries to come from clean extracted source text; if no clean
  source sentence exists, archive/noindex the record instead of manufacturing an implication.
- Preserve curated long-form decks and implications only when they pass the shared
  public-copy guard.
- Keep source attribution, URLs, and images unchanged. Change publication eligibility
  only when no clean source-grounded card sentence exists.

## Reviewable Steps

- [x] Add failing tests for the three observed public formulas and RSS coverage.
- [x] Replace deterministic angle/template fallback copy with source-grounded excerpts.
- [x] Route RSS through the same source-grounded presentation boundary as public cards.
- [x] Repair currently published signal-card presentation fields and rebuild derived
      taxonomy/search artifacts through existing generators.
- [x] Run focused tests, build, public audits, full tests, and `content:gate`.
- [x] Inspect desktop/mobile and RSS output, then request independent code review.
- [ ] Commit with a Lore message and deploy the exact commit to preview only.

## Likely Files

- `config/bannedPhrases.yml`
- `scripts/lib/card-copy-quality-gate.mjs`
- `scripts/lib/card-copy-fallbacks.mjs`
- `scripts/lib/rss-builder.mjs`
- `scripts/audit-public-content-quality.mjs`
- `scripts/repair-public-card-copy.mjs`
- `tests/card-copy-quality-gate.test.mjs`
- `tests/rss-builder.test.mjs`
- `src/data/latest-news.json`
- `src/data/archived-news.json`
- `src/data/search-index.json`
- `src/data/taxonomy-pages.json`

## Risks And Rollback

- Source excerpts can contain boilerplate or clipped text; the shared guards must reject
  those candidates and exclude the affected RSS item rather than synthesize copy.
- Rebuilding derived JSON can create a large diff; only canonical generators may write
  it, and record counts/IDs must be compared before and after.
- Long-form editorial copy must not be replaced by feed excerpts.
- Rollback is a single local commit. Push, production promotion, production secrets,
  managed storage, and cache purge remain out of scope.
