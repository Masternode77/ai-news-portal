# Native Codex artwork replacement — 2026-09-13

Baseline: successful Vercel production deployment `dpl_3fo4qTu5D55er6uvxPYdQE44THb7`, serving `www.computecurrent.com`, commit `1daac8a5ae8524b83124a3928793fdceec522b95` (0.0.29).

The user clarified that the dark cards containing geometric shapes and a baked-in headline were the replacement target, even though they were valid image files. The user then selected the existing Image2/Codex-native workflow. No OpenAI API key or exported session credentials were used. The native tool did not report its exact model, so model fields remain empty.

Nine new native artworks were generated and visually reviewed. The three screenshot examples received illustrations for grid-to-chip power delivery, disaggregated compute, and nuclear restart. Eight of the resulting illustrations also form a shared topic library for the bulk replacement: grid, compute, nuclear, cooling, chips, campus construction, network equipment, and technology research. These are conceptual editorial illustrations, not documentary photographs of the named facilities or products. They are shared artwork, not a claim of a unique generated image for every article.

Existing native artwork for the EIA load-timing article was recovered from its verified registered source. Existing native artwork for the cooling-procurement authored column was preserved. The remaining 997 records were queued for replacement through `scripts/import-codex-image.mjs`. The importer now supports `src/data/authored-columns.json` alongside the news collections and preserves non-image editorial fields.

Each import registers a source hash and article prompt fingerprint, writes hero, thumbnail, OpenGraph and legacy variants, and records `provider: codex`. Local execution details and the per-record topic assignments are retained under `evidence/image2-replacement-20260913/` (ignored working evidence). The canonical manifest and article metadata are versioned.

This migration does not install a background image-generation schedule. Future Codex generation continues to use the existing native session workflow; CI consumes registered files.

## Local verification

- 1,000 title-card records replaced; one existing EIA artwork registration recovered; one existing authored-column artwork preserved.
- All 1,002 records resolve to native Codex artwork with matching registered fingerprints and source hashes. All hero/thumbnail/OpenGraph files decode and have their required dimensions.
- No non-image editorial fields changed; collection counts remain 35 latest news, 950 archived news and 17 authored columns.
- Targeted queue/import/provider tests: 18 passed. Astro check: zero errors, zero warnings (24 existing hints).
- The CLI manifest now resolves from the working directory, so isolated tests cannot write into the repository manifest.
- Production-mode local build: 92 pages, successful. Static preparation regenerated zero article fallbacks and synchronized search/taxonomy image metadata.
- Chrome smoke checks of home and columns at 1440px and 390px: all 24 home images and 17 column images loaded at both widths; zero page errors or horizontal overflow.
- Local replacement and validation complete. No deployment was performed in this migration turn.
