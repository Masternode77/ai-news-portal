# Weekly digest operations

The public `/newsletter/` page shows a rolling seven-day digest of up to six real Compute Current article pages. It uses the same `buildHomepageFeed` eligibility path as the homepage, then requires a current public detail link and excludes invalid dates, future dates, and items outside the seven-day window. Current source authorization and article quality therefore remain build-time requirements.

Run `node scripts/build-weekly-digest.mjs` to inspect the current digest as JSON. Use `--format=html` for an escaped, generation-only web preview, or `--now=<ISO timestamp>` for a repeatable historical check. The command writes to standard output and does not mutate reader data.

## Weekly preparation

The Prepare weekly digest workflow produces reviewable JSON and HTML artifacts every Monday at 07:30 Korea time (Sunday 22:30 UTC). These artifacts support the on-site weekly summary and editorial review.
