# Monetization Roadmap

Compute Current now has the public structure for a B2B intelligence business: free signal board, newsletter capture, Pro subscription surface, Team and Enterprise funnels, sponsor products, media kit, premium reports, and vendor directory.

## Phases

1. Audience capture: Daily AI Infrastructure Brief, homepage capture, article capture, footer capture, and subscriber export.
2. Paid reader conversion: Free, Pro, Team, and Enterprise plan surfaces with soft paywall-ready access levels.
3. Direct revenue: sponsorship inquiry, media kit, sponsored report, webinar sponsor, category sponsor, and directory featured listing inventory.
4. Research products: report preview pages with request flow until payment integration is configured.
5. Enterprise: Compute Current Terminal demo funnel for custom watchlists, alerts, API/RSS, dashboards, and custom research.

## Integration Gaps

- Configure `LEADS_WEBHOOK_URL` for durable production lead capture. `/api/leads` validates and stores submissions locally, but Vercel serverless local storage is not durable across cold starts.
- Protect static internal QA surfaces with `ADMIN_PAGE_PASSWORD`/`ADMIN_PAGE_USERNAME` or the existing `ADMIN_PASSWORD`/`ADMIN_USERNAME` pair.
- Configure checkout before enabling hard paid access.
- Configure analytics provider with `PUBLIC_GA4_ID` or `PUBLIC_PLAUSIBLE_DOMAIN`.
- Add live audience metrics to the media kit when verified.
