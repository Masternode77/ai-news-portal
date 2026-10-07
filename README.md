# Compute Current — AI Infrastructure Intelligence

Production-ready Astro portal for curated AI, data center, semiconductor, power, and cloud infrastructure intelligence.

## Monetization & analytics (attested and route-gated)

Configured publisher or analytics IDs do not by themselves enable third-party
loaders, slots, or analytics. The candidate is intentionally off by default.

- A valid `PUBLIC_ADSENSE_CLIENT` (`ca-pub-…`) supplies the account record for
  `/ads.txt`, including while advertising remains disabled for review. AdSense
  requires that ID, `PUBLIC_GOOGLE_CMP_READY=true`,
  `PUBLIC_ADSENSE_CONTENT_READY=true`, and at least one canonical public detail
  article with `publication_integrity.ok=true` before code can activate it.
- `PUBLIC_ADSENSE_CONTENT_READY` is an operator attestation for a meaningful,
  manually reviewed original-article inventory; it cannot override zero or
  invalid verified detail inventory. Initial activation uses manually placed
  units only. Keep Auto ads disabled until post-approval production
  DOM/placement/accessibility QA is recorded.
- `PUBLIC_GA4_ID` (`G-…`) is also gated by `PUBLIC_GOOGLE_CMP_READY`. Set that
  flag only after the Google-certified CMP is published and its EEA/UK/CH
  accept, reject, and revocation flows have been tested. This repository does
  not provide a custom consent banner.
- `/privacy/` is intentionally free of Google advertising, Analytics, and CMP
  runtime. The policy page directs applicable visitors to the footer privacy
  choices control on a public content page and to Google Ads Settings.
- `PUBLIC_ADSENSE_SLOT_LEADERBOARD` / `_INFEED` / `_ARTICLE` / `_BOX` describe
  the manually placed eligible units; route gating remains an additional check.

Full setup walkthrough (Korean): [`docs/monetization-setup.md`](docs/monetization-setup.md).
Operational preflight and incident procedures: [`docs/adsense-operations-runbook.md`](docs/adsense-operations-runbook.md).
Comparator evidence, current implementation crosswalk, and operator boundaries: [`docs/commercialization-benchmarks.md`](docs/commercialization-benchmarks.md).

## What changed in this update

- **Homepage refresh without changing the core format**
  - Keeps a source-linked editorial feed rather than a dashboard or terminal surface
  - Uses the light, neutral reading system with restrained blue actions defined in `DESIGN.md`
  - Preserves clear hierarchy for title, summary, category, region, source, and eligible analysis links

- **Rights-gated scheduled publishing pipeline**
  - Uses `config/sourceRegistry.yml`, not the retired hardcoded feed list, as its
    authoritative source inventory.
  - Fetches only feeds returned by the registry&rsquo;s text-rights gate. While every
    registered source remains unreviewed or disabled, there are no authorized
    sources and a scheduled run exits without publication.
  - When sources are authorized, it plans and quality-gates available candidates;
    publication count is conditional on the resulting eligible inventory, not a
    fixed per-run promise.

- **Subscription-based curation and analysis**
  - The Mac's locally authenticated Codex CLI uses `gpt-6-astra` for selection,
    summaries, classification, tags, general long-form analysis and image prompts.
  - Claude Code uses `claude-fable-5-1` for The Current; Astra cross-checks source evidence.
  - Authentication, quota and model errors stop the run. There is no automatic API fallback.
  - See [subscription setup](docs/subscription-generation.md) before activation.

- **Conditional Expert Lens enrichment**
  - The pipeline hydrates visible records and enriches focused publishable
    articles; it does not guarantee a fixed “Latest-3” window.
  - Primary model wiring is exposed via `EXPERT_LENS_MODEL`. Deterministic
    completion remains available for offline/legacy processing and hydration of
    historical stored records; incomplete live subscription replies stop the run.

- **Codex-managed image flow**
  - Default provider is `IMAGE_PROVIDER=codex`; legacy `image2` callers resolve to the same local provider
  - New artwork is generated and visually reviewed in an active Codex session, then registered with `scripts/import-codex-image.mjs`
  - CI and Vercel consume registered files or write deterministic local WebP fallback variants without an image API credential
  - Reader-side selection uses a category fallback SVG only when no trusted article variant is available
  - External image hotlinking is avoided for published cards

- **Authorized 50-card homepage + archive search**
  - The homepage builds up to **50** cards from `src/data/latest-news.json` and `src/data/archived-news.json`, after public product-fit and current source-text authorization gates
  - `LATEST_NEWS_LIMIT=30` controls the primary-store split; it is not the homepage’s visible-card maximum
  - If Supabase credentials are configured, older articles are also upserted into a Supabase archive table
  - `src/data/search-index.json` merges live + archived content for client-side search

## Project structure

```text
.
├── .github/workflows/update-news.yml
├── public/generated/
├── scripts/
│   ├── capture-homepage.mjs
│   ├── pipeline.mjs
│   ├── send-telegram-photo.mjs
│   ├── lib/
│   │   ├── constants.mjs
│   │   ├── content.mjs
│   │   ├── curate.mjs
│   │   ├── fetch-feeds.mjs
│   │   ├── image-generator.mjs
│   │   ├── image-providers/
│   │   ├── normalize.mjs
│   │   ├── openrouter.mjs
│   │   ├── rank.mjs
│   │   ├── source-fetch.mjs
│   │   └── state-store.mjs
│   └── state/pipeline-state.json
├── src/
│   ├── data/
│   ├── layouts/Layout.astro
│   ├── pages/index.astro
│   └── styles/global.css
└── vercel.json
```

## Local run

```bash
npm install
LLM_PROVIDER=disabled PIPELINE_USE_EXISTING_POOL=1 npm run pipeline
npm run check
npm run build
npm run dev
```

## Environment variables

### Content + curation
- `LLM_PROVIDER`: `subscription` by default; `disabled` for deterministic/offline work.
  `openrouter` is a deliberate legacy opt-in, never a fallback.
- `SUBSCRIPTION_INCLUDED_USAGE_CONFIRMED=1`: set only after verifying model access
  and disabling paid extra usage in both subscription accounts.
- `SUBSCRIPTION_CODEX_BIN` / `SUBSCRIPTION_CLAUDE_BIN`: optional official CLI executable paths.
- Existing OpenRouter model/key variables apply only in explicit legacy mode.
- Run `npm run check:subscription` on the Mac before `npm run generate:subscription`.
  See [activation and scheduling](docs/subscription-generation.md); pulling Git does not install a schedule.

### Image generation
- `IMAGE_PROVIDER` *(optional)*: defaults to `codex`
  - `codex`: consumes artwork registered from the current Codex session and otherwise uses local fallback variants
  - `image2`: compatibility alias for the same local provider
  - `local`: deterministic local fallback provider
- `IMAGE2_HERO_SIZE` and `IMAGE2_OUTPUT_FORMAT` control the local article variant contract retained for compatibility.

The published image contract is unchanged: registered assets and fallback variants are written under `public/generated/articles/`, article data receives local `/generated/` paths, and external source images are not hotlinked as published card art. Reader-side category fallback SVGs cover missing or untrusted article variants.

See [docs/codex-image-workflow.md](docs/codex-image-workflow.md) for the artwork registration and verification procedure. GitHub Actions and Vercel do not perform remote image generation.

### Pipeline controls
- `MAX_ITEMS_FETCHED` *(optional)*: defaults to `30`
- `DAILY_CURATION_TARGET` *(optional)*: defaults to `6`
- `ITEMS_PER_RUN` *(optional)*: defaults to `2`
- `LATEST_NEWS_LIMIT` *(optional)*: defaults to `30`
- `REFRESH_INTERVAL_HOURS` *(optional)*: defaults to `8`
- `PIPELINE_USE_EXISTING_POOL=1` *(optional)*: validate locally from checked-in data when network access is unavailable

### Archive persistence
- `SUPABASE_URL` *(optional)*: Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` *(optional)*: service role key for archive upserts
- `SUPABASE_ARCHIVE_TABLE` *(optional)*: defaults to `archived_articles`

### Authenticated admin APIs

The private, noindex admin entry point is `/admin.html`; a successful session
opens `/admin/dashboard/`. These views use the authenticated `/api/admin/login`,
`/api/admin/dashboard`, and `/api/admin/article` APIs. Configure all of the
following before using them:

- `ADMIN_USERNAME`
- `ADMIN_PASSWORD_HASH`, generated as `scrypt$<salt>$<derived-key>` with
  `scripts/admin-password-hash.mjs`
- `ADMIN_SESSION_SECRET`, a cryptographically random value of at least 32 bytes
  used to sign sessions
- `ADMIN_VERCEL_RATE_LIMIT_READY=true` only after the production Vercel Firewall
  IP rate-limit rule for `POST /api/admin/login` is published and tested

The runtime fails closed in production until the rate-limit attestation is true.
Do not set legacy plaintext `ADMIN_PASSWORD` or `ADMIN_AUTH_SECRET`; they are
not the current authentication contract. See
[`docs/admin-setup.md`](docs/admin-setup.md) and
[`docs/admin-auth-production-gate.md`](docs/admin-auth-production-gate.md) for
the hash, rotation, and external-control verification procedure.

## Mac generation and GitHub validation

The existing Mac Codex task owns the 00:05 / 08:05 / 16:05 KST generation
cadence after its one-time activation. Follow [subscription generation](docs/subscription-generation.md).
It generates text through subscription CLIs, completes native artwork, then runs
all tests and content gates before an authorized publication.

GitHub's Application Validation runs on every pull request to `main`, every
push to `main`, or manual dispatch. It
installs dependencies and the RSS transform runtime, checks the project, and runs
the production dependency audit, `npm test`, and `npm run content:gate:built`
against that test run's build. Local and Mac publication validation continues to
use the complete `npm run content:gate` command. It
does not generate, commit, push or
record a generation heartbeat. The operations monitor checks the committed Mac
generation heartbeat, so a validation-only success cannot conceal a stalled Mac.

## Release versioning

Human-authored changes merged into `main` automatically create the next semantic
patch version only after Application Validation succeeds for that exact `main`
commit. The release synchronizes `package.json` and `package-lock.json`, adds an annotated
`vX.Y.Z` tag, and publishes a GitHub Release. A manual Release workflow run performs
the same application validation and can select
`patch`, `minor`, or `major` when the change requires a larger version increment.

Automated news refresh commits do not create releases. After validation, the
release workflow classifies the actual commit diff: changes limited to the
content-only paths for `src/data`, generated public images, the image manifest,
pipeline state, and generated audit/taxonomy reports skip semantic versioning.
Any path outside that bounded inventory is an application change and remains
eligible for the automatic patch release. Content refreshes update the deployed
snapshot without changing the product version. For an exact production
review, record both the semantic version and the exact Git commit SHA because a
newer content-only commit can legitimately follow the most recent release tag.

## Deploy to Vercel

1. Import the repository into Vercel
2. Astro 7.3 is auto-detected via `vercel.json` and builds as a static site
3. Set the documented deployment environment variables only after their external prerequisites are evidenced
4. Deploy

## Notes

- The candidate remains a static Astro 7.3 site. Static output can carry a
  validated compatible CSP, but this deployment cannot issue a per-request nonce
  for the selected AdSense/CMP model and has not validated such a policy. Its
  deliberate no-enforced-CSP posture is therefore a documented risk acceptance.
  Do not add a report-only CSP without a collector; introduce report-only or
  enforced CSP only after a nonce-capable architecture or a validated compatible
  policy is available.
- The daily plan is stored in state so curated stories survive across all three daily runs
- The homepage keeps the original board format while upgrading the visual quality substantially
- `scripts/update-news.js` is now just a compatibility alias to `scripts/pipeline.mjs`
