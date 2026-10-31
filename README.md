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
- `PUBLIC_GA4_ID` (`G-…`) uses `PUBLIC_GOOGLE_CMP_READY` by default. Set that
  flag only after the Google-certified CMP is published and its EEA/UK/CH
  accept, reject, and revocation flows have been tested. For analytics only, explicitly set
  PUBLIC_ANALYTICS_CONSENT_MODE=basic with a valid GA4 ID and keep CMP readiness false.
  The local banner loads GA only after acceptance, keeps all ad consent denied, and supports
  footer reopening/revocation. It does not replace the certified advertising CMP.
- `/privacy/` is intentionally free of Google advertising, Analytics, and CMP
  runtime. The policy page directs applicable visitors to the footer privacy
  choices control on a public content page and to Google Ads Settings. In basic analytics mode, local Analytics choices are available on policy pages too, without loading Google tags.
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

## Rebuild v2 (Phase 2 skeleton) — local run

The rebuild lives beside the legacy code as npm workspaces (`apps/site`, `packages/shared`, `packages/pipeline`); see `docs/adr/ADR-001-repo-structure.md`, `docs/architecture/target.md` and `docs/STATUS.md`. Nothing here changes how the legacy site is built or deployed.

```bash
npm ci                                   # installs legacy + workspace dependencies (Node 22.x)
npm run v2:typecheck                     # tsc (packages/*) + astro check (apps/site)
npm run v2:test                          # node --test across the three workspaces, fixtures only
npm run v2:build                         # astro build for apps/site (SITE_DATA_SOURCE=empty works)
npm run v2:pipeline -- run --dry-run --replay --fixture sample --json
npm run v2:pipeline -- run --dry-run --live --stage ingest --json   # Phase 3a: real feeds, memory ledger only
CC_FLAG_STAGES_NORMALIZE=true npm run v2:pipeline -- run --dry-run --replay --fixture dedupe --sources fixtures/sources/dedupe.yaml --stage ingest,normalize --json   # Phase 3b: 12 items from 3 wires -> 6 candidates
CC_FLAG_STAGES_NORMALIZE=true CC_FLAG_STAGES_SCORE=true npm run v2:pipeline -- run --dry-run --replay --fixture scoring --sources fixtures/sources/scoring.yaml --stage ingest,normalize,score --json   # Phase 3c: 13 items -> 6 pass -> 2 selected
CC_FLAG_STAGES_NORMALIZE=true CC_FLAG_STAGES_SCORE=true CC_FLAG_STAGES_GENERATE=true npm run v2:pipeline -- run --dry-run --replay --fixture scoring --sources fixtures/sources/scoring.yaml --stage ingest,normalize,score,generate --json   # Phase 3d: 2 selected -> 2 news_brief drafts from recorded replies
CC_FLAG_STAGES_NORMALIZE=true CC_FLAG_STAGES_SCORE=true CC_FLAG_STAGES_GENERATE=true CC_FLAG_STAGES_IMAGE=true npm run v2:pipeline -- run --dry-run --replay --fixture scoring --sources fixtures/sources/scoring.yaml --stage ingest,normalize,score,generate,qa,image --json   # Phase 3f: image stage after QA (QA off → 0 drafts pass, fail-closed)
CC_FLAG_STAGES_NORMALIZE=true CC_FLAG_STAGES_SCORE=true CC_FLAG_STAGES_GENERATE=true CC_FLAG_STAGES_QA=true CC_FLAG_STAGES_IMAGE=true npm run v2:pipeline -- run --dry-run --replay --fixture scoring --sources fixtures/sources/scoring.yaml --stage ingest,normalize,score,generate,qa,image --json   # Phase 3g: 2 drafts -> 26 verdicts -> 1 passes (placeholder image), 1 rejected (UNGROUNDED_NUMBER)
CC_FLAG_STAGES_NORMALIZE=true CC_FLAG_STAGES_SCORE=true CC_FLAG_STAGES_GENERATE=true CC_FLAG_STAGES_QA=true CC_FLAG_STAGES_IMAGE=true CC_FLAG_PUBLISH_TARGET=staging npm run v2:pipeline -- run --dry-run --replay --fixture scoring --sources fixtures/sources/scoring.yaml --stage ingest,normalize,score,generate,qa,image,publish --json   # Phase 3h: the QA-passed draft becomes a publications row in the run's memory DB (published 1, redirects synced 44: 28 × 301 + 16 × 410)
node packages/pipeline/tools/migrate-legacy-publications.ts --dry-run   # Phase 3h: plan the Phase 5 legacy migration (25 preserved URLs -> ready / not_public / missing)
CC_FLAG_STAGES_NORMALIZE=true CC_FLAG_STAGES_SCORE=true CC_FLAG_STAGES_GENERATE=true CC_FLAG_STAGES_QA=true CC_FLAG_STAGES_IMAGE=true CC_FLAG_PUBLISH_TARGET=staging CC_FLAG_NOTIFY_TELEGRAM=true TELEGRAM_BOT_TOKEN=<dummy> TELEGRAM_CHAT_ID=0 npm run v2:pipeline -- run --dry-run --replay --fixture scoring --sources fixtures/sources/scoring.yaml --stage ingest,normalize,score,generate,qa,image,publish --json   # Phase 3i: the run summary (--json summary.text) plus a soft-failed Telegram delivery (NETWORK_DISABLED under --replay)
npm run v2:pipeline -- ops --from <run.json>                              # Phase 3i: ops check on a run dump (Supabase without --from): ok / stale / never / failing, exit 1 when not ok
npm run v2:pipeline -- run --live --trigger dispatch --json               # Phase 4 shadow (no --dry-run): writes the staging Supabase project named by SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY; must be --live; publish_target none|staging only
```

- The pipeline CLI accepts `--stage <name>[,<name>]`, `--dry-run`, `--live`, `--fixture <name>`, `--replay`, `--config`, `--sources`, `--fixtures-dir`, `--trigger`, `--json`, `--log-level`; `pipeline ops [--from <json>]` (Phase 3i) assesses the run ledger; `pipeline review [--run <id> | --status <s>] [--limit <n>] [--window <chars>]` (Phase 4) prints the sample-review dump (drafts, QA verdicts, source excerpts around ungrounded numbers; `.github/workflows/shadow-review.yml` puts it in a step summary); in `pipeline.yml` the `ops-check` job turns its exit code into one GitHub alarm issue (`packages/pipeline/tools/ops-issue-sync.ts`: found by a body marker, written only on a state transition, closed on recovery, `issues: write` on that job only). A fixture run seeds the memory DB from `fixtures/db/<fixture>.json` when present. The normalize (Phase 3b), score (Phase 3c), generate (Phase 3d), qa (Phase 3g) and image (Phase 3f) stages are off by default (`flags.stages.normalize: false`, `flags.stages.score: false`, `flags.stages.generate: false`, `flags.stages.qa: false`, `flags.stages.image: false`); set `CC_FLAG_STAGES_NORMALIZE=true` / `CC_FLAG_STAGES_SCORE=true` / `CC_FLAG_STAGES_GENERATE=true` / `CC_FLAG_STAGES_QA=true` / `CC_FLAG_STAGES_IMAGE=true` to run them. A QA stage that is off passes nothing (fail-closed), so image and publish get no input. The scoring rubric is data in `config/scoring.yaml` (`--scoring <path>`): five axes, weights, thresholds, selection caps and every vocabulary and pattern the engine uses; each scored candidate stores a per-axis reason (`candidates.rubric`, migration `0002_candidates_rubric.sql`); `selection.skip_review_status` (default rejected, pending) keeps a candidate whose news_brief draft for the current prompt was rejected or is held from taking a slot again (`PREVIOUSLY_REJECTED` / `PENDING_REVIEW`). The generate stage (Phase 3d) turns each selected candidate into a Korean `news_brief` draft: the prompt is the versioned file `prompts/news_brief.md` (`--prompts-dir`) whose banned-phrase line is rendered from `config/banned-phrases.yaml` (`--banned-phrases`; the same inventory is matched on every draft and reported as `checks.banned`, blocking comes with the QA stage), the model writes only title, summary, why-it-matters, expert lens and tags while the stage fills the source fields and slug, and `llm.provider` in `config/pipeline.yaml` picks the adapter (`fixture` replays `fixtures/llm/news_brief/<raw_item_id>.json`; `anthropic` calls the Messages API through the run's fetch and needs `ANTHROPIC_API_KEY`; `disabled` fails the stage). Every call is estimated against `budget` before it is made, and each draft records a numeric grounding check and the longest run of words shared with the source (reported, not enforced until the QA stage). The image stage (Phase 3f) gives every QA-passed draft an image through a provider chain (`image.provider` then `image.fallback_chain`, always ending in the brand placeholder): the placeholder is a deterministic SVG per publication, `openai` is opt-in (`OPENAI_API_KEY`, priced per image from `image.pricing`, skipped when the run budget cannot cover it), and a placeholder standing in for a configured provider leaves an `IMAGE_MISSING` soft verdict. Generated bytes go to an image store (memory by default, a directory with `--images-dir`), never into the repo. The QA stage (Phase 3g) runs every enabled rule of `config/qa.yaml` (`--qa`) on every draft in the file's order and never stops early: one rule is one file under `packages/pipeline/src/qa/rules/<CODE>.ts` named after the reason code it emits, severities, `auto_pass` and every threshold live only in the config, every verdict is written to `qa_results`, a hard failure rejects the draft (`drafts.review_status: rejected`), a soft failure without `auto_pass` holds it for human review (`pending`), and a rule listed in the config without a file fails the run (`QA_RULE_UNKNOWN`). The publish stage (Phase 3h) is switched by `flags.publish_target` (`none` by default: nothing is written and every candidate is reported as `dry`; `CC_FLAG_PUBLISH_TARGET=staging` writes to the run's database, the memory one under `--dry-run`): a publication is one `publications` row keyed by slug (a re-run updates it in place, a slug taken by another draft follows `publish.slug_conflict`), `config/redirects.yaml` is synced into the `redirects` table, and on-demand ISR revalidation (`publish.revalidate`, off until the Phase 4 preview, token name only) is reported but never fatal, so publishing never depends on a site build. Source adapters are fixtures unless `--live` swaps in the real RSS/Atom and Epoch index adapters (Phase 3a); Every run requires `--dry-run` until Phase 4 wires Supabase (a bare `--replay` would keep adapters offline but still write the real run ledger); `--live` excludes `--replay`, and `--replay` makes every network call throw.
- Live ingest evidence: the `ingest-live-dry-run` job of `.github/workflows/rebuild-ci.yml` (workflow_dispatch with `live_ingest=true`, no secrets) runs the ingest stage against the live feeds and writes the funnel plus a per-source table to the step summary. `config/sources.yaml` (82 rows) was generated once by `packages/pipeline/tools/migrate-legacy-registry.ts` from the legacy registry and is hand-edited from there; a source the pipeline auto-disabled comes back when its `reviewed_at` is later than the auto-disable day.
- Feature flags: `config/pipeline.yaml` (`flags.stages.<stage>`, `flags.publish_target`, `notify.telegram.enabled`) or the environment (`CC_FLAG_STAGES_IMAGE=false`, `CC_FLAG_PUBLISH_TARGET=staging`, `CC_FLAG_NOTIFY_TELEGRAM=true`, `CC_FLAG_LLM_PROVIDER=anthropic` for the Phase 4 shadow while the file default stays `fixture`). Unknown flags fail the run. Every finished run ends with the ADR-007 summary in the log and in `--json summary.text`; with Telegram on, the same text goes out once through the Bot API (`TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` by name only; a failed delivery is counted, never a run failure). `.github/workflows/pipeline.yml` is the scheduled runtime (ADR-002), shipped as `workflow_dispatch` only with the cron commented and `--dry-run` fixed until Phase 4; the slots are 00:45 / 08:45 / 16:45 KST (`45 15,23,7 * * *` UTC).
- Site data source: `SITE_DATA_SOURCE=supabase` (`SUPABASE_URL` + `SUPABASE_ANON_KEY`, published rows only), `legacy_json` (maps the committed reader pages in `src/data/`; for local dev and the strangler period, not available in the Vercel function runtime) or `empty`. Unset means `empty`, so a deployment opts in explicitly. `GET /healthz` reports the active source and the published count. Pages are `noindex` until `SITE_INDEXABLE=true`.
- `supabase/migrations/0001_init.sql` is written but not applied; applying it is a pre-approval item.
- TypeScript runs directly on Node 22 type stripping: erasable syntax only, `.ts` extensions in relative imports, `import type` for types.
