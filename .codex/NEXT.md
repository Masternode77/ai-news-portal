# NEXT

## Current branch
- `upgrade/gpt-5-6-sol`, merged with `origin/main` SHA `f8bc10a2`.
- HEAD before the public-copy implementation commit: `ec44f386`.
- Rollback tag: `backup/pre-gpt56-upgrade-20260711T091118Z`.
- No push, production promotion, production-secret operation, or cache purge has been performed.

## Latest completed checklist item
- Removed deterministic card-copy templates and made extracted source evidence the public-card boundary.
- Added contamination detection and repair for trusted source fields; generated summaries cannot validate themselves.
- Unified homepage, archive, RSS, search, and taxonomy on shared eligibility and projection decisions.
- Added publisher-owned taxonomy regeneration so future cycles cannot recreate repair-only drift.
- Made public-copy repair transactional, CWD-independent, digest-checked, and idempotent.
- Normalized current latest/archive/search/taxonomy data; quarantined records fail closed.
- Restricted the homepage visual lead to recent, dated, real Image2-provider assets.
- Added full-scroll image decoding checks to commercial visual QA.
- Completed independent code review and architecture review with no remaining implementation findings.

## Changed files
- Source/copy boundary: `scripts/lib/source-evidence-integrity.mjs`, card quality/relevance/public eligibility,
  publish and production phase helpers, banned phrases, feed builders, and `ArticleCard.astro`.
- Derived projections: `src/lib/public-search-projection.js`, `scripts/lib/taxonomy-projection.mjs`,
  archive/search/taxonomy generation and publisher output manifests.
- Repair/data: `scripts/repair-public-card-copy.mjs`, latest/archive/search/taxonomy JSON,
  generated audit reports, and focused regression tests.
- Image/visual reliability: Image2 visual lead freshness, static-image idempotency, image-store fallback writes,
  and lazy-image traversal in commercial visual QA.

## Validation results
- Current corpus: 739 records; latest 30, archive 709, search 739.
- Fail-closed classification: 75 missing-source records, 68 card-quality failures, 3 curated source signals restored.
- Source evidence repair applied to 13 legacy records; current public source contamination is 0.
- Repair dry-run: every mutation counter 0, including `searchArtifactMismatches`; immutable digest
  `65e3dcdd5dc49eae280672130fb3273c10ea3a5c21b914f3915eed22b4115223`.
- Public inventory: 33 eligible records, 31 homepage cards, 32 archive cards, one longform route;
  canonical taxonomy membership is 32 after one duplicate source URL is collapsed.
- Full `npm test`: 554 total, 553 passed, 0 failed, 1 intentional skip.
- `npm run check`: 0 errors, 0 warnings, 11 existing type hints.
- `npm audit --audit-level=low`: 0 vulnerabilities; baseline was 18.
- `npm run content:gate`: passed; public copy, image, admin exclusion, and performance audits passed.
- Rendered audit: 7 pages, 1 article, 30 cards, 0 broken images; homepage audit 31/33.
- Static budgets: 4,604,449 B dist, 11,432 B JS, 100,239 B CSS, 93,875 B largest HTML,
  335,600 B largest image.
- `npm run qa:qc -- --skip-live`: deployable with operational follow-up.
- Commercial visual QA: 8/8 captures passed; homepage 31/31, archive 32/32, article 1/1 images decoded;
  no broken images, overflow, clipping, or overlap.
- Independent code review: APPROVE; architecture review found no remaining implementation defects;
  canonical search/taxonomy projections and rendered membership each showed 0 mismatches.

## Blockers
- Preview Postgres, Blob, and admin credentials are absent; managed persistence is not proven.
- Independent 150-item relevance and 40-sample writing labels require human review.
- OAuth/2FA, firewall, backups, monitoring, and secret rotation are operational follow-up.
- Production promotion requires explicit preview approval.

## Exact next step
- Create the Lore implementation commit from the fully reviewed and verified tree.
- Deploy that exact clean commit to Vercel preview, verify routes/images/screenshots, and commit the receipt.
- Keep push, production promotion, production secrets, and cache purge excluded.
