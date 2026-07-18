# GPT-5.6 full audit

## Disposition

The current product is deployable but not release-ready for the requested upgrade.
The public site is visually coherent, yet the canonical content path is fragmented,
relevance is permissive, generated-image provenance is inaccurate, the admin surface
is incomplete, and several high-severity security boundaries are absent.

## Repository and runtime

Production runs:

```text
.github/workflows/update-news.yml
  -> npm run pipeline
  -> scripts/pipeline.mjs
  -> scripts/lib/content.mjs
  -> scripts/lib/expert-lens.mjs
  -> quality/repetition/fidelity gates
  -> scripts/lib/archive-store.mjs
  -> checked-in JSON and generated images
  -> Vercel npm run build
```

Other editorial-cycle, Blog Engine v4, narrative DNA, public-content-v2, long-form,
and regeneration paths can independently write the same stores. No single provenance
field reliably identifies which engine/version produced an article.

The build is not pure. `sync:dashboard-data` and `prepare:static-images` rewrite source
artifacts before Astro builds 1,532 pages, including hundreds of static editor routes.
Dashboard-only commits still trigger Vercel production deployments despite `[skip ci]`.

## Content quality

The last 24 production pipeline runs produced zero published analyses, 18 signals, and
29 repetition-blocked candidates. The homepage eligibility builder admits records with
missing routing metadata, and broad token tests treat generic GPU, chip, storage, or
power references as infrastructure relevance. Confirmed false positives include a
webcam reCAPTCHA story, a hobby 8,192-core GPU project, a quantum workshop, HamsterOS,
and consumer gaming hardware.

Repeated public formulas include variants of `ties AI buildout timing to`, `the
practical checkpoint is`, and `the exposed dependency is`. Fallback modules contain
generic phrases that the public quality policy otherwise bans. The humanizer and editor
are principally regex replacement systems, not evidence-card/draft/critic/rewrite passes.

There are seven fixture files, roughly 33 relevance fixture mentions, and one writing
fixture file. The required 150-item relevance benchmark and 40-item writing benchmark
do not exist.

## Images

At audit time, the default provider was `chatgpt`, while the scheduled workflow passed
Gemini credentials without setting `IMAGE_PROVIDER`. That mismatch has been resolved:
Image2 is now the default, the scheduled workflow maps `OPENAI_API_KEY`, and source
artwork is attempted before provider generation unless `forceAiImage` explicitly requests
a regenerated visual. Provenance still requires explicit source or generated metadata.

All latest records have a generated WebP path, but 22 of 30 are source-canonical and
eight lack complete provider/status/hero metadata. Images have no responsive `srcset`,
`sizes`, or intrinsic dimensions. Generated assets are revalidated on every request.

## Public product and SEO

- Two sitemap implementations disagree: custom sitemap has 38 URLs; Astro sitemap has 48.
- RSS contains one item and is 930 bytes.
- Twenty-nine indexable pages contain fewer than 180 rendered words.
- Fourteen taxonomy pages have no articles but remain indexable.
- Operational routes `/about/`, `/editorial-policy/`, `/methodology/`,
  `/ai-disclosure/`, and `/contact/` return 200 and appear in navigation and sitemaps.
- Structured data points `correctionPolicy` and `publishingPrinciples` at a route that
  must be removed.
- Article JSON-LD is serialized unsafely into a raw script element.
- The homepage advertises archive search but provides no search input or search route.

Desktop layout has no observed console errors, 46 rendered images, and meaningful alt
text. Mobile has no horizontal document overflow, but the first 844 px contain no image
and category navigation overflows into a horizontal scroller. The article route is
mobile-safe but too short and structurally generic for its claimed analysis route.

## Admin and storage

The writable CMS is GitHub JSON commits to `main`, not a transactional database. There
is no canonical object-storage upload path, durable session/rate-limit store, complete
CRUD route set, revision persistence, or role model. `/admin` and `/admin/dashboard`
are static shells; most required routes return 404. The API is authenticated and CSRF
protected when configured, but absent credentials produce a detailed 500 response.

An optional Supabase path is an archive sink rather than the canonical CMS. Public
rendering reads checked-in JSON. GitHub writes are vulnerable to stale-head races and
audit reads can collapse history on non-404 failures.

## Security

High-severity findings are stored XSS in JSON-LD, SSRF/unbounded remote fetches, public
exposure of complete operational job payloads, and unsafe URL schemes reaching links.
Medium findings cover publish-gate bypasses, process-local throttling, mutable audit
history, dashboard `innerHTML`, local path escape, image MIME/decompression handling,
workflow secret scope, and missing browser/API security headers.

The dependency upgrade removes all 18 npm audit findings. No tracked private key or
confirmed credential was found. Secret-like matches are fixtures. Security fixes are
still required at application boundaries; dependency status alone is not acceptance.

## Build and CI/CD

- Production uses Node 24 while Actions declares Node 22.
- GitHub Actions push generated snapshots directly to `main` three times daily and every
  15 minutes for the dashboard.
- Actions use mutable major tags.
- Visual QA installs unpinned packages dynamically and exposes `PERCY_TOKEN` job-wide.
- The public build includes static admin edit routes and internal dashboard assets.
- Build and tests are not isolated from generated-data mutation or execution order.

## Decision

Keep Astro. Build a single canonical orchestrator and plugin registry around the proven
extraction/gating primitives, migrate production callers incrementally, and keep legacy
commands as non-writing wrappers until preview parity is proven. Move writable admin
state behind a storage abstraction with a database adapter; do not claim production CMS
persistence until credentials and migrations are exercised in preview.
