---
name: compute-current-design-qa
description: Use when reviewing Compute Current public UI, homepage/article presentation, images, visual QA captures, or design regressions.
---

# Design QA

Use this skill for public visual and presentation checks.

## Canonical Rules
- Public pages must not expose admin, debug, score, threshold, or internal QA language.
- Images should be local, relevant, safe, and not misleading about provenance.
- Verify rendered output instead of relying only on source inspection when layout or images changed.

## Workflow
1. Inspect impacted Astro components, public data, and image fields.
2. Build or run targeted visual capture when rendering matters.
3. Check public copy, image audits, and homepage/article tests.

## Useful Commands
- `npm run build`
- `npm run qa:visual:smoke`
- `npm run qa:visual:capture`
- `npm run audit:images`
- `node --test tests/homepage-layout.test.mjs tests/public-image-display.test.mjs`
