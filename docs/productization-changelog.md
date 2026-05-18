# Productization Changelog

## Monetization Foundation

- Added `/subscribe`, `/pricing`, `/advertise`, `/media-kit`, `/reports`, `/enterprise`, `/contact`, `/directory`, `/login`, and `/account`.
- Added Daily AI Infrastructure Brief capture modules across header, homepage, article body, footer, and subscribe page.
- Added subscription tier, entitlement, and soft-paywall policy modules.
- Added sponsor inventory, rotation, and clean sponsor slot rendering.
- Added premium report store, report cards, and report request CTAs.
- Added Compute Current Terminal enterprise funnel.
- Added analytics event taxonomy and no-op/GA4/Plausible-compatible tracking.
- Added `/api/leads` and `/api/leads-export` so monetization forms submit to a server endpoint with JSONL storage and optional webhook forwarding.
- Added middleware protection for static internal QA routes so `/admin/content-quality/*` and `/dashboard/*` are not publicly readable without admin credentials.
- Filtered archive-only stories out of the homepage search payload to keep public discovery aligned with homepage routing.
- Added monetization readiness and premium article quality gates.
- Strengthened routing against consumer tech, generic AI, labor, recruiting, biography, and unrelated consumer stories in core lanes.
