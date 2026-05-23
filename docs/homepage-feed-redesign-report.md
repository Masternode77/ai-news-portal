# Homepage Feed Redesign Report

Generated at: 2026-05-23T13:08:34Z

## Old Layout Problems

- The homepage read too much like an operations console.
- Reader-facing modules exposed selection and workflow concepts instead of editorial value.
- The public surface split recent work into buckets that made the site feel sparse even when usable source items existed.
- Empty states and labels made normal publishing gaps look like internal process failures.

## New Layout

- Hero copy now positions Compute Current as AI infrastructure intelligence for power, data centers, chips, cloud capacity, cooling, and capital.
- The first public product surface is a chronological Latest Analysis feed.
- The feed shows 37 deduplicated public cards from the regenerated data set, with a 30-50 card target when enough public-safe items exist.
- Longform analysis and short signal cards appear together in one publication-style list.
- Category filtering is available for All, Power & Grid, Data Centers, Cooling, Silicon & Systems, Cloud Capacity, Capital & Deals, Policy & Siting, and Enterprise Infrastructure.

## Removed Public Sections

- Signals being monitored
- Published deskwork
- Latest qualifying signal
- Latest published analysis
- Cycle status panels
- Operational publishing-policy empty states

## Added Public Sections

- Hero positioning statement
- Latest Analysis feed
- Publication card labels: Analysis, Brief, Signal, Market Map, Policy Watch, Deal Watch, Technical Note
- Normal archive CTA and archive search language

## Verification

- `npm run build` passed.
- `npm run content:gate` passed.
- Homepage audit passed with 37 deduplicated public cards.
