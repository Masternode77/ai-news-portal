# Homepage Premium Redesign Plan

## Objective
Make the Compute Current homepage feel more premium, editorial, and distinctive instead of generic article aggregation while preserving the AI infrastructure intelligence product boundary.

## Aesthetic Direction
Build an `Infrastructure Intelligence Desk` between the masthead/category nav and the existing featured/feed surfaces. The page should feel like an operator/investor briefing desk: curated, dense enough to scan, restrained, sharp, and memorable. Avoid marketing-hero copy, decorative-only effects, cards inside cards, generic AI-blog phrasing, and purple/blue gradient slop.

## File Scope
- `tests/homepage-premium-surface.test.mjs`: new TDD contract.
- `src/pages/index.astro`: homepage composition and semantic premium module.
- `src/styles/global.css`: homepage-scoped visual and responsive styling only.
- Existing regression tests/audits: no production behavior edits unless a regression requires the smallest fix.

## Success Criteria
- C001: Desktop first viewport renders `data-homepage-premium-surface="intelligence-desk"`, visible `Infrastructure Intelligence Desk`, `data-premium-hero-headline`, `data-premium-market-context`, and `data-premium-lead-card` before the feed.
- C002: Mobile 390x844 keeps premium module, headline, market-context strip, and first article card readable with no overlap and no horizontal overflow.
- C003: Homepage preserves real article feed/images and avoids generic AI-blog/internal language or one-note purple/blue gradient styling.

## Wave Order

### Wave 1: RED Contract
Owner: test-writing worker.

Files:
- `tests/homepage-premium-surface.test.mjs`

Tasks:
- Add test id `homepage premium surface renders a named intelligence desk module before the feed`.
- Add test id `homepage premium surface keeps the intelligence deck readable on mobile`.
- Add test id `homepage premium surface preserves article feed and avoids generic AI-blog styling`.
- Run RED before production edits.

RED command:
```bash
node --test tests/homepage-premium-surface.test.mjs 2>&1 | tee .omo/ulw-loop/evidence/homepage-premium-C001-red.txt
cp .omo/ulw-loop/evidence/homepage-premium-C001-red.txt .omo/ulw-loop/evidence/homepage-premium-C002-red.txt
cp .omo/ulw-loop/evidence/homepage-premium-C001-red.txt .omo/ulw-loop/evidence/homepage-premium-C003-red.txt
```

Expected RED: failures cite missing `data-homepage-premium-surface`, `Infrastructure Intelligence Desk`, premium mobile selectors, and premium style block.

### Wave 2: Semantic Homepage Module
Owner: implementation worker.

Files:
- `src/pages/index.astro`

Tasks:
- Use existing `feed.featured` and `latestFeed.items` data.
- Insert a new premium desk module after `CategoryNav` and before `FeaturedArticle`.
- Include the required data attributes for C001/C002.
- Preserve `FeaturedArticle`, `LatestAnalysisFeed`, archive CTA, and footer.
- Keep copy infrastructure-specific and decision-support oriented.

### Wave 3: Desktop Styling
Owner: implementation worker.

Files:
- `src/styles/global.css`

Tasks:
- Add homepage-scoped selectors under `.publication-home`.
- Create a distinctive editorial desk layout using restrained contrast, hairline grid cues, warm/green/graphite accenting, and dense but readable context blocks.
- Avoid broad shared `.article-list-card` rewrites.
- Avoid purple, violet, indigo, generic AI gradients, beige/brown dominance, and oversized marketing hero patterns.

### Wave 4: Mobile Styling
Owner: implementation worker.

Files:
- `src/styles/global.css`

Tasks:
- Add 1024px and 720px responsive rules for the premium desk.
- Ensure single-column flow, no fixed viewport-width typography, `min-width: 0`, `max-width: 100%`, and safe wrapping on premium text/card elements.

### Wave 5: GREEN And Regression
Owner: orchestrator verifies worker output.

Targeted GREEN:
```bash
node --test tests/homepage-premium-surface.test.mjs 2>&1 | tee .omo/ulw-loop/evidence/homepage-premium-C001-green.txt
cp .omo/ulw-loop/evidence/homepage-premium-C001-green.txt .omo/ulw-loop/evidence/homepage-premium-C002-green.txt
cp .omo/ulw-loop/evidence/homepage-premium-C001-green.txt .omo/ulw-loop/evidence/homepage-premium-C003-green.txt
```

Regression:
```bash
node --test tests/homepage-layout.test.mjs tests/public-homepage-regression.test.mjs tests/public-image-display.test.mjs tests/homepage-image-http-audit.test.mjs tests/homepage-premium-surface.test.mjs
npm run check
npm run build
npm run audit:homepage
npm run audit:public
npm run audit:images
```

### Wave 6: Manual QA
Owner: orchestrator or dedicated QA worker.

Start local preview from the built output:
```bash
npm run preview -- --host 127.0.0.1 --port <free-port>
```

C001 browser desktop:
- Open `http://127.0.0.1:<port>/`.
- Capture `.omo/ulw-loop/evidence/homepage-premium-C001-desktop.png`.
- Capture `.omo/ulw-loop/evidence/homepage-premium-C001-browser.json`.
- PASS iff first viewport contains visible `Infrastructure Intelligence Desk` and required premium markers.

C002 browser mobile:
- Set viewport to 390x844.
- Capture `.omo/ulw-loop/evidence/homepage-premium-C002-mobile.png`.
- Capture `.omo/ulw-loop/evidence/homepage-premium-C002-browser.json`.
- PASS iff bounding boxes are positive, premium module/headline/context/card do not overlap, and document has no horizontal overflow.

C003 HTTP/image:
```bash
curl -i http://127.0.0.1:<port>/ > .omo/ulw-loop/evidence/homepage-premium-C003-http.txt
node scripts/audit-homepage-images-http.mjs --base-url http://127.0.0.1:<port> --out .omo/ulw-loop/evidence/homepage-premium-C003-http-images.json
```

Cleanup receipt:
- Kill preview process.
- Verify no listener remains on the chosen port.
- Close browser context or record fallback browser cleanup.
- Remove any temp browser profile.
- Include cleanup receipt in every recorded criterion evidence.

## Final Quality Gate
- Run `ai-slop-cleaner` on changed file scope or record a no-op cleaner report if no cleanup is needed.
- Spawn `codex-ultrawork-reviewer` with goal, diff, test evidence, browser/HTTP artifacts, and notepad path.
- Fix every reviewer issue and re-run full scenarios until unconditional approval.
- Checkpoint the ulw-loop goal only after every criterion is `pass`.
