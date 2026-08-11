# Commercialization Benchmarks

Status: research snapshot checked 2026-08-10 (Asia/Seoul).

This is the tracked, self-contained benchmark for the current static Compute
Current candidate. It distinguishes direct operator evidence from the
implementation decisions made here. A cited product or pricing page without a
displayed publication date is treated as a living page and dated by the access
date. No third-party revenue estimate is treated as fact.

## Evidence grades

- **A — direct current operator evidence:** current product, policy, pricing,
  or implementation page checked on the stated date.
- **A-code — immutable operator code evidence:** public source pinned to a full
  commit SHA.
- **B — older operator explanation:** useful evidence of a durable pattern, not
  proof that every implementation detail is unchanged.
- **Inference:** a Compute Current transfer decision, not an assertion about
  the comparator.

## Frozen conclusion

The comparators support an open publication with archive and RSS first; visible
trust, provenance, corrections, AI, privacy, and commercial disclosures before
any paywall; sparse manual ad placements with reserved space and unambiguous
labels; and fail-closed commercialization. Sponsorship, paid research,
newsletter delivery, accounts, entitlements, and billing remain future products
with their own contracts and consent flows.

## Comparator cases

### Case 1 — SemiAnalysis

**Evidence grade:** A and B.

- [About](https://semianalysis.com/about/) (A, living page checked 2026-08-10)
  describes subscriptions, institutional research/models, consulting, and
  semiconductor/AI-infrastructure coverage.
- [Privacy policy](https://semianalysis.com/privacy-policy/) (B, effective
  2024-11-04 and checked 2026-08-10) covers accounts, payment data, analytics,
  cookies, and email pixels.

**Adopt:** the operator/investor/capacity product boundary and an open-to-
institutional ladder, represented by **src/pages/about.astro**,
**src/config/site.ts**, **src/pages/subscribe.astro**,
**src/pages/pricing.astro**, **src/pages/sample.astro**,
**src/pages/briefing.astro**, and **src/pages/contact.astro**.

**Defer/reject:** do not promise an institutional login, paywall, audience size,
or paid desk before the corresponding systems and evidence exist.

### Case 2 — Stratechery

**Evidence grade:** A.

- [About](https://stratechery.com/about/) (living page checked 2026-08-10)
  describes free weekly and paid daily analysis plus conflict disclosures.
- [Stratechery Plus](https://stratechery.com/stratechery-plus/) (checked
  2026-08-10) documents paid frequency, personalized delivery, renewals, and
  team subscriptions.

**Adopt:** open flagship and portable distribution before gating:
**src/pages/rss.xml.ts**, **src/pages/follow.astro**,
**src/layouts/Layout.astro**, **src/pages/archive/index.astro**,
**src/pages/archive/[page].astro**, **src/pages/editorial-policy.astro**,
**src/pages/methodology.astro**, and **src/pages/advertising-policy.astro**.

**Defer/reject:** personalized feeds, accounts, renewals, invoices, team seats,
and paid daily publication until identity, entitlement, billing, tax, and
support systems exist.

### Case 3 — The Pragmatic Engineer

**Evidence grade:** A and B.

- [Newsletter about](https://newsletter.pragmaticengineer.com/about) (A,
  living page checked 2026-08-10) documents individual and group
  subscriptions and invoicing.
- [Ethics statement](https://blog.pragmaticengineer.com/ethics-statement/)
  (A, checked 2026-08-10) separates newsletter, books, podcast sponsorship,
  and video advertising incentives.
- [Paid-newsletter learnings](https://newsletter.pragmaticengineer.com/p/newsletter-learnings)
  (B, published 2022-09-07 and checked 2026-08-10) explains reader funding
  and first-party promotion.

**Adopt:** disclosure and channel separation through
**src/pages/advertising-policy.astro**, **src/pages/editorial-policy.astro**,
**src/pages/methodology.astro**, **src/pages/ai-disclosure.astro**, and the
live-ad/house-promotion split in **src/components/monetize/AdSlot.astro**.

**Defer/reject:** an ad-free paid edition or any membership claim before reader
demand, billing, and entitlement operations are evidenced.

### Case 4 — ServeTheHome

**Evidence grade:** A.

- [About](https://www.servethehome.com/about/) (checked 2026-08-10) identifies
  IT-professional coverage, advertising, and affiliate disclosure.
- [Q1 2026 editor letter](https://www.servethehome.com/sth-q1-2026-letter-from-the-editor-ai-got-scary-good/)
  (published 2026-03-28, checked 2026-08-10) describes opt-in newsletter
  practice and adjacent paid-report activity.
- [ASUS thermal-lab report](https://www.servethehome.com/asus-thermal-lab-tour-2026-testing-ai-servers/)
  (published 2026-07-10, checked 2026-08-10) demonstrates nearby sponsored
  visit disclosure.
- [Privacy policy](https://www.servethehome.com/about/data-processing-and-privacy-policy/)
  was checked 2026-08-10.

**Adopt:** early disclosure, limited in-flow placements, and RSS without a
conversion modal via **src/components/monetize/AdSlot.astro**,
**src/pages/news/[id].astro**, **src/pages/follow.astro**, and
**src/pages/privacy.astro**.

**Defer/reject:** informal sponsorship wording or duplicated legal text. Any
future funded content needs a standard disclosure, funder identity,
consideration type, and editorial-control statement.

### Case 5 — Blocks & Files

**Evidence grade:** A and B.

- [Home](https://www.blocksandfiles.com/) (A, checked 2026-08-10) visibly
  distinguishes editorial, partner, sponsored, and advertising inventory.
- [About](https://www.blocksandfiles.com/about-us/) (A, checked 2026-08-10)
  identifies the publication/operator.
- [Privacy](https://www.blocksandfiles.com/privacy/) (A/B, updated 2025-05 and
  checked 2026-08-10) describes consent before sponsor lead transfer.
- [Newsletter](https://www.blocksandfiles.com/newsletter/) was checked
  2026-08-10.

**Adopt:** durable archive, explicit sponsor identity, and point-of-collection
notice through **src/pages/archive/index.astro**,
**src/pages/archive/[page].astro**, **src/pages/rss.xml.ts**, and
**src/components/SiteFooter.astro**.

**Defer/reject:** lead generation, ambiguous label proliferation, and a funded-
content class until a typed content model, disclosure template, and operator
workflow exist.

### Case 6 — Data Center Dynamics

**Evidence grade:** A.

- [Data protection/privacy policy](https://www.datacenterdynamics.com/en/data-protection-privacy-policy/)
  (updated 2025-04-25, checked 2026-08-10) describes media/events analytics,
  named-sponsor lead transfer, and behavioural measurement.
- The [Compute, Storage & Networking channel](https://www.datacenterdynamics.com/en/the-compute-storage-networking-channel/),
  [partner list](https://www.datacenterdynamics.com/en/dcd-partners/), and
  [RSS](https://www.datacenterdynamics.com/en/rss/) returned 403 to the
  research client on 2026-08-10. They are access gaps, not verified bodies.

**Adopt:** deep vertical traversal and explicit sponsor-data sharing at
collection through **src/pages/category/[slug].astro**,
**src/pages/company/[slug].astro**, **src/pages/region/[slug].astro**,
**src/pages/contact.astro**, and **src/pages/privacy.astro**.

**Defer/reject:** session replay, behavioural profiling, webinar/event lead
generation, and marketing automation without a named provider, lawful basis,
retention schedule, notice, vendor contract, and tested opt-out.

### Case 7 — Changelog

**Evidence grade:** A and A-code.

- [About](https://changelog.com/about), [Sponsor](https://changelog.com/sponsor),
  [pricing](https://changelog.com/sponsor/pricing),
  [Changelog++](https://changelog.com/%2B%2B), and
  [Privacy](https://changelog.com/privacy) were checked 2026-08-10.
- Pinned code: [canonical/Open Graph/RSS metadata](https://github.com/thechangelog/changelog.com/blob/7c8d9fff2ad0598e9a064a8a7347e0828e8f5d1b/lib/changelog_web/templates/layout/app.html.heex#L8-L54),
  [newsletter sponsor card](https://github.com/thechangelog/changelog.com/blob/7c8d9fff2ad0598e9a064a8a7347e0828e8f5d1b/lib/changelog_web/templates/news_issue/_ad.html.eex#L1-L20),
  and [episode sponsor links](https://github.com/thechangelog/changelog.com/blob/7c8d9fff2ad0598e9a064a8a7347e0828e8f5d1b/lib/changelog_web/templates/episode/show.html.heex#L41-L53)
  are A-code evidence at SHA `7c8d9fff2ad0598e9a064a8a7347e0828e8f5d1b`.

**Adopt:** canonical/feed portability and clear commercial labels through
**src/layouts/Layout.astro**, **src/pages/rss.xml.ts**, **public/feed.xsl**,
**src/components/monetize/AdSlot.astro**, and
**src/pages/advertising-policy.astro**.

**Defer/reject:** membership, ad-removal, sponsor packages, or audience figures
until measured inventory and the required account, contract, and billing
systems exist.

### Case 8 — Oxygen Updater / OS Updater

**Evidence grade:** A, B, and A-code.

- [Website redesign engineering post](https://oxygenupdater.com/article/303/)
  (B, published 2022-03-05 and checked 2026-08-10),
  [Privacy](https://oxygenupdater.com/privacy/) (A/B, version 5.1 updated
  2022-10-10), and [home](https://oxygenupdater.com/) (A, checked 2026-08-10)
  evidence static delivery, RSS, manual ads, donations, and ad-free unlocks.
- Pinned code: [static article and manual ads](https://github.com/oxygen-updater/website/blob/3703cdadefa53cbb13c82970e0107f7d4adcd0f4/src/pages/article/%5Bid%5D.tsx#L273-L346),
  [article metadata](https://github.com/oxygen-updater/website/blob/3703cdadefa53cbb13c82970e0107f7d4adcd0f4/src/pages/article/%5Bid%5D.tsx#L54-L130),
  [AdSense component](https://github.com/oxygen-updater/website/blob/3703cdadefa53cbb13c82970e0107f7d4adcd0f4/src/components/adsense.tsx#L18-L106),
  and [ads.txt](https://github.com/oxygen-updater/website/blob/3703cdadefa53cbb13c82970e0107f7d4adcd0f4/public/ads.txt)
  are A-code evidence at SHA `3703cdadefa53cbb13c82970e0107f7d4adcd0f4`.

**Adopt:** static-first delivery and inspectable manual ads through
**package.json**, **astro.config.mjs**, **src/pages/news/[id].astro**,
**src/pages/ads.txt.ts**, **src/lib/seo-safeguards.js**,
**src/layouts/Layout.astro**, and **src/components/monetize/AdSlot.astro**.

**Defer/reject:** unconditional early ad loading, donations, and ad-free
purchasing claims. Google runtime remains gated by the current monetization
policy and verified operator evidence.

## Implementation crosswalk

The comparator decisions map to the following current repository surfaces.
Every bold repository path is verified by `tests/benchmark-evidence-paths.test.mjs`.

| Concern | Current implementation or deliberate gap |
| --- | --- |
| Commercial concepts | **src/config/site.ts**; noindex/open placeholders in **src/pages/subscribe.astro**, **src/pages/pricing.astro**, **src/pages/sample.astro**, and **src/pages/briefing.astro**; filtering in **astro.config.mjs**. |
| Legal and editorial trust | **src/pages/advertising-policy.astro**, **src/pages/editorial-policy.astro**, **src/pages/methodology.astro**, **src/pages/ai-disclosure.astro**, **src/pages/privacy.astro**, **src/pages/terms.astro**, and **src/components/SiteFooter.astro**. |
| Manual ads and consent | **src/lib/monetization.ts**, **src/layouts/Layout.astro**, **src/components/monetize/AdSlot.astro**, **src/components/LatestAnalysisFeed.astro**, **src/pages/news/[id].astro**, **src/styles/terminal.css**, and **src/pages/ads.txt.ts**. |
| Feed, archive, and discovery | **src/pages/rss.xml.ts**, **public/feed.xsl**, **src/pages/follow.astro**, **src/pages/archive/index.astro**, **src/pages/archive/[page].astro**, **src/pages/sitemap.xml.ts**, and **src/pages/robots.txt.ts**. |
| Public quality and rights | **scripts/lib/source-registry.mjs**, **scripts/lib/source-extraction-fail-closed.mjs**, **scripts/lib/copyright-safe-copy-guard.mjs**, **scripts/lib/final-publication-integrity.mjs**, **scripts/lib/public-surface-eligibility.mjs**, and **config/sourceRegistry.yml**. |
| Search and structured presentation | **src/lib/seo-safeguards.js**, **src/pages/category/[slug].astro**, **src/pages/company/[slug].astro**, **src/pages/region/[slug].astro**, **src/pages/about.astro**, and **src/pages/contact.astro**. |
| Deployment shape | **package.json**, **astro.config.mjs**, and **vercel.json**. The site remains Astro 7.2 static output; it has compatible non-CSP security headers but no enforced or report-only CSP. |

## Policy and architecture evidence

- [AdSense program policies](https://support.google.com/adsense/answer/48182?hl=en),
  [consent requirements](https://support.google.com/adsense/answer/13554020?hl=en-GB),
  [TCF integration](https://support.google.com/adsense/answer/9804260?hl=en),
  [Consent Mode](https://developers.google.com/tag-platform/security/guides/consent),
  [CSP guidance](https://support.google.com/adsense/answer/16283098?hl=en),
  [ads.txt](https://support.google.com/adsense/answer/12171612?hl=en),
  [paid links](https://developers.google.com/search/docs/crawling-indexing/qualify-outbound-links),
  and [Article structured data](https://developers.google.com/search/docs/appearance/structured-data/article)
  are the governing Google references.
- [Astro CSP configuration](https://docs.astro.build/en/reference/configuration-reference/#securitycsp),
  the [Astro 7.1 release](https://astro.build/blog/astro-710/),
  [Vercel static headers](https://docs.astro.build/en/guides/integrations-guide/vercel/#staticheaders),
  [Vercel Astro support](https://vercel.com/docs/frameworks/frontend/astro),
  the [Astro RSS recipe](https://docs.astro.build/en/recipes/rss/), and
  the [Astro sitemap integration](https://docs.astro.build/en/guides/integrations-guide/sitemap/)
  define the current static architecture and future options.

Astro 7.2 can support a build-time hash CSP; an enforced AdSense/CMP CSP is
deferred because this static deployment has neither a request-time nonce path
nor a validated compatible policy. Do not add a report-only CSP without a
collector. Revisit it only after a nonce-capable runtime or validated compatible
policy and production evidence are available.

## External operator boundaries

The following are not code-complete and must not be represented as complete:

1. Create and verify the AdSense account/site, legal/payee/tax profile, real
   publisher and slot IDs, ads.txt status, policy-center status, invalid-traffic
   controls, and brand-safety settings.
2. Publish and test a Google-certified TCF CMP for EEA/UK/CH accept, reject,
   granular choice, revoke, returning visit, and unaffected-region flows before
   setting `PUBLIC_GOOGLE_CMP_READY=true`.
3. Manually review meaningful original public detail inventory and a current
   publication-integrity pass before setting `PUBLIC_ADSENSE_CONTENT_READY=true`.
4. Verify production manual-ad loader count, filled/empty behavior, route
   deny-list, source/disclosure adjacency, responsive placement, no self-clicks,
   and real CLS/LCP/INP.
5. Obtain legal review for operator identity, jurisdictions, retention,
   processors, data-subject workflow, child threshold, and actual disclosures.
6. Select and operate separate providers/contracts for newsletter, direct
   sponsorship, subscriptions, or briefings before promising those products.
7. Complete rights review for every source before text or image ingestion;
   public accessibility does not grant reuse rights.
8. For CSP, either validate a static compatible policy with a real collector or
   move relevant routes to a nonce-capable request-time architecture.

The DCD access-limited URLs recorded above need operator-browser verification
before they are relied upon as a production dependency.
