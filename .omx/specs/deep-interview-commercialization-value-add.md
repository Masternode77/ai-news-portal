# Deep Interview: Commercialization Value-Add

Date: 2026-06-20

## Objective

Reduce the perception that Compute Current is generic AI news before pushing harder on monetization.

## Decisions

- The first value-add target is public content quality, not pricing or lead capture.
- The most visible defect is repetitive public cards combined with missing or non-obvious article imagery.
- Public imagery should be Image2-centered. Source images are not the default public strategy.
- The homepage main page must visibly include article images.
- Article detail pages must show a visual image at the top of the body.
- The same public-surface standard applies to homepage, archive, category, and article detail pages.
- Homepage first-viewport cards must differ by editorial angle, sentence structure, and decision point.
- The required decision axes are `capacity`, `power`, `capital`, `supply-chain`, and `risk`.

## Acceptance Criteria

- Homepage lead and visible cards render a public image for every card.
- Archive and category cards render a public image for every card.
- Article detail pages render a hero image between the article header and longform body.
- Public image provenance is Image2-centered: generated Image2 image first, category Image2 fallback last, source image only as non-primary metadata.
- The first five homepage feed cards represent distinct bottleneck axes across `capacity`, `power`, `capital`, `supply-chain`, and `risk` when eligible content exists.
- Card decks and why-it-matters copy should vary by bottleneck axis rather than repeating the same generic AI infrastructure frame.

## Out Of Scope

- Production secret configuration.
- Production cache purge.
- Payment, login, CRM, newsletter provider, or real gated-product implementation.
