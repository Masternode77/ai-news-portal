# AdSense Operations Runbook

## Purpose and limits

Use this runbook to prepare and operate the repository&rsquo;s optional Google advertising surface. It documents
repository behavior and operating checks; it is not legal, tax, privacy, or AdSense approval advice. No step here
promises approval, ad serving, traffic volume, or revenue.

## Runtime states

| State | Repository behavior |
| --- | --- |
| `PUBLIC_ADSENSE_CLIENT` is blank or invalid | No AdSense loader, publisher metadata, manual units, or authorized-seller record is active. |
| Valid `PUBLIC_ADSENSE_CLIENT`, `PUBLIC_GOOGLE_CMP_READY` not `true` | The publisher ID is configured. `ads.txt` publishes the corresponding `pub-…` record for ownership/review, while advertising and Analytics remain off. |
| Valid GA4 ID plus `PUBLIC_GOOGLE_CMP_READY=true` | The operator has attested that the certified Google CMP handoff is ready. Eligible routes may load Analytics; route exclusions still apply. This flag is not a substitute for account/site approval, real ads.txt IDs, EEA/UK/CH choice tests, or legal review. |
| Valid AdSense ID, CMP ready, and `PUBLIC_ADSENSE_CONTENT_READY=true` | AdSense still stays off unless the code finds a nonzero canonical detail inventory with `publication_integrity.ok=true`. The environment attestation cannot override zero or invalid inventory. |

`PUBLIC_GOOGLE_CMP_READY` is a trimmed, case-insensitive boolean. Keep `PUBLIC_GOOGLE_CMP_READY=false` until
account/site approval, real account-issued ads.txt IDs, certified Google CMP publication, EEA/UK/CH
accept/reject/revoke tests, and legal review are all evidenced.

`PUBLIC_ADSENSE_CONTENT_READY` is also a trimmed, case-insensitive operator attestation. Set it only after a
meaningful manually reviewed original article inventory is available. The code-level floor additionally requires a
nonzero canonical detail article with `publication_integrity.ok=true`; this attestation cannot override zero or
invalid inventory.

## External readiness checklist

- [ ] Confirm the production AdSense account, site ownership, and account-issued `ca-pub-…` / `pub-…` identifiers.
- [ ] Confirm a meaningful manually reviewed original article inventory. Record at least one public canonical detail
  article that satisfies the repository&rsquo;s `publication_integrity.ok=true` verification floor; zero or invalid
  inventory keeps AdSense disabled even when `PUBLIC_ADSENSE_CONTENT_READY=true`.
- [ ] Confirm the publisher&rsquo;s legal entity, payment profile, tax information, and account access outside this repository.
- [ ] Select and configure a certified Google CMP for applicable EEA/UK/Swiss traffic; record its vendor list,
  message version, jurisdictions, and deployment owner.
- [ ] Obtain appropriate legal review of notices, lawful bases, choice/revocation behavior, and the distinction
  between Google policy requirements and local legal obligations.
- [ ] Record retention decisions for hosting logs, analytics reports, CMP consent records, and incident evidence,
  including the responsible operator and review date.
- [ ] Verify `/privacy/` is accessible without the Google advertising, Analytics, or consent runtime. The policy links
  to Google&rsquo;s partner-site data explanation and points applicable visitors to the footer **Privacy choices** control
  on another public content page.

## Configuration and deployment checks

1. Set only account-issued values in `PUBLIC_ADSENSE_CLIENT`, `PUBLIC_ADSENSE_SLOT_*`, and `PUBLIC_GA4_ID`. Keep
   `PUBLIC_ADSENSE_CONTENT_READY=false` until the verified-detail inventory check below is recorded.
2. Deploy with `PUBLIC_GOOGLE_CMP_READY=false` until account/site approval, real ads.txt IDs, certified CMP
   publication, EEA/UK/CH accept/reject/revoke tests, and legal review are recorded.
3. Verify `https://www.computecurrent.com/ads.txt` returns HTTP 200, `Content-Type: text/plain; charset=utf-8`, and
   the exact account-issued `google.com, pub-…, DIRECT, f08c47fec0942fa0` record. This record is expected before
   the CMP gate activates Google loaders.
4. Test the certified CMP on the production domain in applicable EEA/UK/Swiss conditions, including notice display,
   accept/reject choices, vendor disclosures, and the footer **Privacy choices** revocation flow.
5. Before enabling AdSense, record the meaningful manually reviewed original article inventory and verify the
   code-level nonzero canonical `publication_integrity.ok=true` detail-article floor. Then set
   `PUBLIC_ADSENSE_CONTENT_READY=true`; that attestation cannot override zero or invalid inventory.
6. Only then set `PUBLIC_GOOGLE_CMP_READY=true`, redeploy, and confirm a monetizable content page has one loader at
   most. Confirm `/privacy/` still has none.
7. Use configured manual units only for the initial launch. Keep Auto ads disabled because its automatic placements
   can bypass locally verified wrappers. Enable Auto ads only after approval when production DOM, placement, and
   accessibility QA explicitly attests its behavior and the resulting record is retained.
8. Check mobile and desktop layouts, slow loading, empty/no-fill slots, keyboard focus, and that ad space does not
   overlap editorial controls or content.

## CSP risk acceptance

The Vercel configuration deliberately uses static-compatible response headers and has a documented risk acceptance:
Astro 7.2 static output can carry a validated compatible CSP, but this deployment has no enforced CSP for its selected
AdSense/CMP architecture because it cannot issue a per-request nonce and no compatible policy has been validated. Do
not add a report-only CSP without a configured collector. Add a report-only or enforced CSP only after moving to a
per-request nonce-capable architecture or after validating a compatible policy against the static Astro output,
AdSense, and the selected CMP; a report-only policy also needs a verified reporting collector before deployment.

## Invalid-traffic and no-self-click procedure

- Do not click ads yourself, ask colleagues or readers to click them, refresh pages to increase impressions, use
  bots, click exchanges, paid-to-click services, or incentives tied to ad interaction.
- Do not use live advertising pages for routine placement testing. Use account-approved test procedures or keep the
  CMP gate disabled while verifying the static surface.
- Monitor traffic by source, geography, landing page, and ad unit. Keep an incident note with the observation time,
  affected source, action taken, and the configured retention period for that record.
- If suspicious traffic or accidental-click patterns appear, pause or remove the affected acquisition source and
  remove ad code from affected pages while investigating. Preserve only the evidence needed for the documented
  incident and retention policy.
- Escalate account-policy notices, serving limits, or unexplained anomalies to the account owner. Do not attempt to
  conceal, offset, or manufacture traffic.

## Ongoing review

- [ ] Review Policy Center, ads.txt status, and account messages on the operator&rsquo;s chosen schedule.
- [ ] Recheck CMP availability and the footer revocation flow after changing CMP settings, route gating, or the
  privacy policy.
- [ ] Recheck the publisher legal entity, payment/tax status, vendor disclosures, and retention decisions whenever
  the operating organization or jurisdictions change.
- [ ] Keep a separate record of external-account actions; do not put publisher IDs, payment details, consent
  receipts, or personal data into repository evidence.
