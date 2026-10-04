# AI and operator coverage expansion

## Diagnosis

The archive was not policy-only: its 19 columns included compute hardware,
cooling, operator financing, cloud capacity and policy. However, the active
source set before this change had 22 feeds: 19 government/regulator full-text
sources and three abstract-only arXiv feeds. No commercial company source was
text-authorized. That is a source bottleneck, not simply a writing prompt issue.

There were also two ranking mismatches: feed intake and deterministic curation
fallback ranked infrastructure scores alone, although AI topic relevance was
already accepted by curation and the column selector.

## Changes

- Both intake and fallback ranking now use the stronger existing AI/infra lane.
  Wire publication tiers and all quality/rights gates remain unchanged.
- Column selection tracks AI business, data center/cloud operators, compute
  hardware, power/cooling, policy and other infrastructure. Among eligible
  candidates within 15% of the top evidence score, it favors the least-covered
  beat among the latest five columns within 30 days. No topic quota.
- Prompts explicitly include provider earnings, financing, leases, capacity,
  model economics and deployment. Provider claims must remain attributed; policy
  and power are not compulsory frames for company news.
- `authored.lastSelection.diagnostics` includes beat-level candidate, eligible
  and rejection counts plus selection reason. New columns retain their beat.

## Scoped source review

On October 4, 2026 the following official documentation pages displayed a
CC BY 4.0 content notice (except otherwise noted), with separate code licensing:

- [Compute Engine releases](https://docs.cloud.google.com/compute/docs/release-notes)
- [Gemini Enterprise Agent Platform releases](https://docs.cloud.google.com/gemini-enterprise-agent-platform/release-notes)
- [Google site policies](https://developers.google.com/terms/site-policies)

Two source rows use those pages only. The Compute Engine page advertises its
[Atom feed](https://docs.cloud.google.com/feeds/compute-release-notes.xml).
The current AI platform's entries are discovered from the
[cross-product release feed](https://docs.cloud.google.com/feeds/gcp-release-notes.xml),
isolating only its named product block before constructing the observed product
page and date anchor. The older Vertex AI generative feed was checked but not
enabled: its newest item was in May, despite current September AI releases in
the successor platform. Do not mistake that legacy feed for current coverage.

Extraction fetches the licensed page, requires its license marker and the exact
date anchor, and stops at the next date. It never falls back to the entire
archive. Fetch and publication authorization enforce the reviewed path. Only
these known dated source URLs preserve their fragments through canonicalization
and deduplication. Article and column source sections link CC BY 4.0, credit
Google Cloud, and identify adaptation/analysis. Publisher images stay disabled.
Final authorization independently rejects undated/invalid anchors, HTTP,
nonstandard ports and userinfo. An empty dated body records an extraction
failure instead of silently treating discovery text as the page's evidence.

This is a narrow documentation-source review, not blanket permission for Google
Cloud Blog, third-party customer material, or other corporate publishers.
All pre-existing unreviewed commercial source flags remain disabled.

## Live probe and limits

The two new feeds returned eight retained candidates in a read-only live probe.
An AI model announcement entered the existing AI relevance lane (score 1.0).
Its dated source extraction returned 786 characters with extraction score 0.86;
that is not proof of column eligibility, which requires deeper evidence and
passes additional gates. A 440-character compute update remained too short.
A separate compute release extracted 1,283 characters without extraction errors.
None of these probes generated or published a column or claimed completed art.

These sources improve AI/cloud operator product coverage. They do not yet supply
broad Equinix, Digital Realty, CoreWeave or other operator earnings/financing
coverage. Those require separately evidenced full-text permissions or a separately
reviewed headline/link-only lane. Changing their flags without such evidence is
not part of this recovery. The 15 legacy artwork holds remain pending; this
change does not fabricate their missing source evidence or permissions.

## Verification

Pre-release checks on October 4:

- Source suite: 664 tests passed. One additional regression was then added for
  homepage date identity and cross-date evidence rejection; all 19 tests in its
  focused source/feed/product-fit run passed.
- Built runtime suite: 22 tests passed.
- Content gate passed: typecheck (zero errors/warnings), production build,
  21 gate tests, public copy/quality/feed/image and private-data exclusion audits.
- Independent read-only review found no remaining defects after the two
  source-boundary repairs. Whitespace validation passed.
- Read-only image queue: 15 pending, zero ready, all held for missing/invalid
  source artifacts and extraction. No held artwork was marked complete.

Production SHA and HTTP checks are performed after the normal Git push; local
test success alone is not a production deployment claim.
No forced column, minimum-gap change, daily-cap change, paid API, credential
export, or deployment bypass is used. The native image queue continues to give
every qualifying new column a fresh, unique, reviewed image.
