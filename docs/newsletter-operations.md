# Newsletter operations

The public `/newsletter/` page shows a rolling seven-day digest of up to six real Compute Current article pages. It uses the same `buildHomepageFeed` eligibility path as the homepage, then requires a current public detail link and excludes invalid dates, future dates, and items outside the seven-day window. Current source authorization and article quality therefore remain build-time requirements.

Run `node scripts/build-weekly-digest.mjs` to inspect the current digest as JSON. Use `--format=html` for an escaped, generation-only HTML preview, or `--now=<ISO timestamp>` for a repeatable historical check. The command writes to standard output and never sends email or mutates subscriber data.

## Subscription activation

Email collection is intentionally inactive until the subscription provider, approved sender identity, and recipient/list policy are selected. With no configuration, the page states that email sign-up is inactive and directs readers to `/rss.xml`.

After those choices are approved, set `PUBLIC_NEWSLETTER_SUBSCRIBE_URL` to the provider's public HTTPS signup URL in the build environment. The page rejects HTTP URLs, URLs containing embedded credentials, malformed values, and non-web schemes. It links to the provider rather than accepting email addresses in this application.

Activating email delivery still requires a separate implementation and approval for the provider integration, sender/domain authentication, unsubscribe handling, privacy copy, delivery schedule, and production dispatch. This repository currently builds the eligible digest only; it does not send mail or claim successful subscription.

## Weekly preparation

The Prepare weekly digest workflow produces reviewable JSON and HTML artifacts every Monday at 07:30 Korea time (Sunday 22:30 UTC). It does not send email. Actual email delivery and subscription activation remain dependent on the approved provider and sender.
