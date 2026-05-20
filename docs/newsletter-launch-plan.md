# Newsletter Launch Plan

Newsletter name: Daily AI Infrastructure Brief

Positioning: Power, capacity, silicon, cooling, cloud, capital, and policy signals behind the AI buildout.

Capture fields:
- email
- role
- company optional
- interest category

Initial operating mode:
- No remote email platform is required for the build.
- Configure `NEWSLETTER_API_URL` and `NEWSLETTER_API_KEY` for remote capture.
- Configure `ENABLE_LOCAL_SUBSCRIBER_STORE=1` and optionally `SUBSCRIBER_STORE_PATH` for local NDJSON capture during private testing.

No intrusive popups are used. The capture appears on the homepage, article pages, and `/subscribe/`.
