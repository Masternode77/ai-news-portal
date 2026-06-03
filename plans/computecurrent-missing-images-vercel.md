# Compute Current Missing Images Vercel Deployment Plan

## TL;DR
> Summary:      Fix the shared public image selector so displayable local generated assets beat unvalidated remote source images when both exist, then deploy the verified result to Vercel production.
> Deliverables:
> - Local-image-first selector behavior with remote-only source-image behavior preserved.
> - Regression coverage for the five HPCwire records and the existing public feed/image contracts.
> - A reusable homepage image HTTP audit harness for local preview and live production checks.
> - Local browser/HTTP evidence, Vercel deployment evidence, production browser/HTTP evidence, and cleanup receipts.
> Effort:       Medium
> Risk:         Medium - shared image selection affects homepage cards, article detail images, OpenGraph images, RSS/sitemap surfaces, and production deployment.

## Scope
### Must have
- Change the shared image selection contract in `scripts/lib/article-image-surface.mjs` so a trusted local generated/canonical image is selected before any remote `sourceImage` when both exist.
- Preserve the existing behavior where a remote `sourceImage` is selected when no local generated/canonical image exists.
- Cover the five known affected records:
  - `0ccf1e3f69f2b513`
  - `0737340e51a0cfb0`
  - `e40a1864f5a8b8e8`
  - `4d21b727a5d2e275`
  - `cf753845198cd7d0`
- Verify that local preview homepage images return HTTP 200 and no rendered `<img src>` contains `hpcwire.com`.
- Deploy to Vercel production only after focused tests, image audits, build, rendered output audit, and local browser/HTTP QA pass.
- Verify live `https://www.computecurrent.com` after deployment with Vercel inspect/log evidence, HTTP image evidence, and a Chrome-driven screenshot.
- Keep deployment scoped despite the current dirty worktree by deploying from a clean worktree/committed state if unrelated changes remain.

### Must NOT have (guardrails, anti-slop, scope boundaries)
- Do not hardcode a fix for only the five IDs or only `hpcwire.com`.
- Do not add runtime/build-time network validation inside `article-image-surface.mjs`; image selection must stay deterministic and local-file based.
- Do not delete or overwrite `sourceImage`, `sourceUrl`, editorial fields, extraction QA fields, or article routing fields in JSON data.
- Do not weaken extraction QA, source-fidelity checks, repetition checks, public routing, product-fit rules, or quality gates.
- Do not add package dependencies or modify lockfiles unless an existing lockfile already changes as part of normal install verification.
- Do not deploy unrelated dirty worktree changes to production.
- Do not deploy before local verification evidence exists.
- Do not commit secrets, Vercel tokens, admin credentials, or raw env dumps.

## Verification strategy
> Zero human intervention - all verification is agent-executed.
- Test decision: TDD + Node built-in `node:test` (`node --test`), with focused failing-first tests before selector implementation.
- QA policy: every task has agent-executed scenarios
- Evidence: `evidence/task-<N>-computecurrent-missing-images-vercel.<ext>`

## Execution strategy
### Parallel execution waves
> Target 5-8 tasks per wave. <3 per wave (except final) = under-splitting.
> Extract shared dependencies as Wave-1 tasks to maximize parallelism.

Wave 1 (no dependencies):
- Task 1: update selector contract and selector implementation.
- Task 3: add the homepage image HTTP audit harness.
- Task 4: capture deployment hygiene, dirty-worktree scope, Vercel CLI, and rollback preflight evidence.

Wave 2 (after Wave 1):
- Task 2: depends [1]; add affected-record public feed regression coverage.
- Task 5: depends [1, 2, 3, 4]; run static/build/audit verification.

Wave 3 (after Wave 2):
- Task 6: depends [5]; run local preview browser and HTTP QA.

Wave 4 (after Wave 3):
- Task 7: depends [6]; deploy to Vercel production from a scoped clean deployment state.

Wave 5 (after Wave 4):
- Task 8: depends [7]; run production browser/HTTP QA and write final cleanup report.

Critical path: Task 1 -> Task 2 -> Task 5 -> Task 6 -> Task 7 -> Task 8

### Dependency matrix
| Task | Depends on | Blocks | Can parallelize with |
|------|------------|--------|----------------------|
| 1    | none       | 2, 5   | 3, 4                 |
| 2    | 1          | 5      | none                 |
| 3    | none       | 5, 6, 8| 1, 4                 |
| 4    | none       | 5, 7   | 1, 3                 |
| 5    | 1, 2, 3, 4 | 6, 7   | none                 |
| 6    | 5          | 7      | none                 |
| 7    | 6          | 8      | none                 |
| 8    | 7          | Final  | none                 |

## Todos
> Implementation + Test = ONE task. Never separate.
> Every task MUST have: References + Acceptance Criteria + QA Scenarios + Commit.

- [ ] 1. Make local generated images win over remote sources when both exist

  What to do: Update the focused selector contract first, run it red, then update `imageVariantObject()` so its priority is: trusted non-placeholder generated/canonical image, trusted placeholder generated/canonical image, remote source image, category fallback. Keep the existing `status: 'placeholder'`, `provider: 'local-placeholder'`, and `fallback: true` metadata when the winning local asset is provider-marked as placeholder. Preserve remote-only behavior for records without a local generated/canonical image.
  Must NOT do: Do not add network fetches, domain blocklists, ID special cases, source field deletion, or JSON data rewrites.

  Parallelization: Can parallel: YES | Wave 1 | Blocks: [2, 5] | Blocked by: []

  References (executor has NO interview context - be exhaustive):
  - Pattern:  `scripts/lib/article-image-surface.mjs:175` - `imageVariantObject()` currently selects trusted non-placeholder generated candidates before remote sources, then trusted placeholder generated candidates.
  - Pattern:  `scripts/lib/article-image-surface.mjs:190` - remote `sourceImageCandidates()` are currently returned before local placeholders.
  - Pattern:  `scripts/lib/article-image-surface.mjs:201` - trusted placeholder generated candidates are already recognized and carry placeholder metadata.
  - Pattern:  `scripts/lib/article-image-surface.mjs:276` - `isTrustedPublicImage()` trusts local assets by default and treats remote images as untrusted unless explicitly validated.
  - Test:     `tests/article-image-source-fallback.test.mjs:27` - old source-over-placeholder assertion must be replaced with local-generated-over-remote assertion.
  - Test:     `tests/image-output.test.mjs:30` - remote-only source image behavior must continue to pass.

  Acceptance criteria (agent-executable only):
  - [ ] `mkdir -p evidence && node --test tests/article-image-source-fallback.test.mjs 2>&1 | tee evidence/task-1-selector-red.txt` fails before implementation with an assertion showing `articleCardImage()` still returns the remote source URL for the updated placeholder-with-source fixture.
  - [ ] After implementation, `node --test tests/article-image-source-fallback.test.mjs tests/image-output.test.mjs 2>&1 | tee evidence/task-1-selector-green.txt` exits 0.
  - [ ] The updated placeholder-with-source fixture asserts `articleCardImage(article)`, `articleHeroImage(article)`, and `articleOpenGraphImage(article)` equal the local generated path, with `variants.thumbnail.status === 'placeholder'`, `variants.thumbnail.provider === 'local-placeholder'`, and `variants.thumbnail.fallback === true`.
  - [ ] The remote-only fixture still asserts remote source image selection when no local generated/canonical image exists.

  QA scenarios (MANDATORY - task incomplete without these):
  ```
  Scenario: local generated image wins over remote source
    Tool:     bash
    Steps:    node --test tests/article-image-source-fallback.test.mjs 2>&1 | tee evidence/task-1-selector-green.txt
    Expected: exit 0; fixture with sourceImage=https://example.com/gitex-source.jpg and generatedImage=/generated/fallbacks/data-centers.svg resolves every variant to /generated/fallbacks/data-centers.svg.
    Evidence: evidence/task-1-selector-green.txt

  Scenario: remote-only source still works
    Tool:     bash
    Steps:    node --test tests/image-output.test.mjs 2>&1 | tee evidence/task-1-remote-only.txt
    Expected: exit 0; remote_only_image_fixture still resolves hero/card/og to https://example.com/remote-source-image.jpg.
    Evidence: evidence/task-1-remote-only.txt
  ```

  Commit: YES | Message: `fix(images): prevent broken remote card artwork` | Files: [`plans/computecurrent-missing-images-vercel.md`, `scripts/lib/article-image-surface.mjs`, `tests/article-image-source-fallback.test.mjs`, `tests/image-output.test.mjs`]

- [ ] 2. Add real affected-record public feed regression coverage

  What to do: Extend `tests/public-image-display.test.mjs` to import/use the five affected IDs and assert each record has a local generated image, that local image exists, `articleCardImage()` is not remote, and no affected public presentation/feed image resolves to `hpcwire.com`. Replace the old duplicate source-over-placeholder test with local-generated-over-remote behavior. For homepage-specific assertions, check only affected records that are homepage eligible, because `0737340e51a0cfb0` is currently archive-only/noindex in local data.
  Must NOT do: Do not force archive-only items onto the homepage or change public routing/status fields to make the test pass.

  Parallelization: Can parallel: NO | Wave 2 | Blocks: [5] | Blocked by: [1]

  References (executor has NO interview context - be exhaustive):
  - Pattern:  `tests/public-image-display.test.mjs:19` - existing public feed image coverage.
  - Pattern:  `tests/public-image-display.test.mjs:69` - old source-over-placeholder assertion must become local-generated-over-remote assertion.
  - Pattern:  `scripts/lib/public-presentation.mjs:29` - public card image is `articleCardImage(article)`.
  - Pattern:  `scripts/lib/public-presentation.mjs:84` - public presentation exposes selected image and metadata.
  - Pattern:  `scripts/lib/homepage-feed-builder.mjs:40` - homepage decoration creates `publicSignal` from public presentation.
  - Data:     `src/data/latest-news.json:1748` - `0ccf1e3f69f2b513` record with HPCwire source and local generated image.
  - Data:     `src/data/latest-news.json:6139` - `0737340e51a0cfb0` record is archive-only/noindex in local data.
  - Data:     `src/data/latest-news.json:6766` - `e40a1864f5a8b8e8` record with HPCwire source and local generated image.
  - Data:     `src/data/latest-news.json:7812` - `4d21b727a5d2e275` record with HPCwire source and local generated image.
  - Data:     `src/data/latest-news.json:8442` - `cf753845198cd7d0` record with HPCwire source and local generated image.

  Acceptance criteria (agent-executable only):
  - [ ] `node --test tests/public-image-display.test.mjs 2>&1 | tee evidence/task-2-public-image-display.txt` exits 0.
  - [ ] The test asserts `affected.length === 5` for the five IDs.
  - [ ] For each affected record, the test asserts `localArticleImageExists(article.generatedImage) === true`, `isRemoteImage(articleCardImage(article)) === false`, and `articleCardImage(article) === article.generatedImage`.
  - [ ] For homepage-eligible affected records, `buildHomepageFeed([...latestNews, ...archivedNews], { limit: 50, minimumVisible: 30 })` emits no `publicSignal.image` containing `hpcwire.com`.

  QA scenarios (MANDATORY - task incomplete without these):
  ```
  Scenario: affected records use local generated images
    Tool:     bash
    Steps:    node --test tests/public-image-display.test.mjs 2>&1 | tee evidence/task-2-public-image-display.txt
    Expected: exit 0; all five affected IDs select /generated/<id>.svg through articleCardImage().
    Evidence: evidence/task-2-public-image-display.txt

  Scenario: archive-only affected record is not forced onto homepage
    Tool:     bash
    Steps:    node --input-type=module -e "import latest from './src/data/latest-news.json' with {type:'json'}; const a=latest.find(x=>x.id==='0737340e51a0cfb0'); if (!(a && a.homepagePublished===false && a.archiveOnly===true)) process.exit(1); console.log(JSON.stringify({id:a.id, homepagePublished:a.homepagePublished, archiveOnly:a.archiveOnly, public_status:a.public_status}))" | tee evidence/task-2-archive-only-record.json
    Expected: exit 0; JSON shows homepagePublished=false and archiveOnly=true for 0737340e51a0cfb0.
    Evidence: evidence/task-2-archive-only-record.json
  ```

  Commit: YES | Message: `test(images): lock affected local image display` | Files: [`tests/public-image-display.test.mjs`]

- [ ] 3. Add a reusable homepage image HTTP audit harness

  What to do: Create `scripts/audit-homepage-images-http.mjs` plus `tests/homepage-image-http-audit.test.mjs`. The script must fetch a base URL homepage, extract `<img src>` values, resolve relative URLs, reject any source whose host matches a repeatable `--blocked-host` flag, optionally require specific `--require-src` values, fetch every resolved image URL, require HTTP 2xx, and write structured JSON evidence to `--out`. Use only Node built-ins.
  Must NOT do: Do not add dependencies, do not use a browser-only parser, do not crawl beyond the homepage unless a future flag asks for it, and do not write secrets to evidence.

  Parallelization: Can parallel: YES | Wave 1 | Blocks: [5, 6, 8] | Blocked by: []

  References (executor has NO interview context - be exhaustive):
  - Pattern:  `scripts/audit-public-images.mjs:32` - existing data-level image audit result shape.
  - Pattern:  `scripts/lib/rendered-output-audit.mjs:136` - existing rendered-output local image failure collection.
  - Pattern:  `scripts/verify-production-surface.mjs:66` - existing fetch-with-timeout style for production checks.
  - Pattern:  `scripts/verify-production-surface.mjs:186` - production verification writes JSON and markdown evidence.
  - Test:     `tests/image-output.test.mjs:17` - Node test style for image-related scripts.

  Acceptance criteria (agent-executable only):
  - [ ] `node --test tests/homepage-image-http-audit.test.mjs 2>&1 | tee evidence/task-3-http-audit-test.txt` exits 0.
  - [ ] `node scripts/audit-homepage-images-http.mjs --help 2>&1 | tee evidence/task-3-http-audit-help.txt` prints accepted flags: `--base-url`, `--out`, `--blocked-host`, and `--require-src`.
  - [ ] The test covers a happy path with local image URLs returning 200.
  - [ ] The test covers a failure path where a blocked host image causes non-zero exit and JSON evidence records the blocked source.
  - [ ] The test covers a failure path where an image URL returns 403 and JSON evidence records `status: 403`.

  QA scenarios (MANDATORY - task incomplete without these):
  ```
  Scenario: script passes when every homepage image is reachable
    Tool:     bash
    Steps:    node --test tests/homepage-image-http-audit.test.mjs --test-name-pattern "passes reachable homepage images" 2>&1 | tee evidence/task-3-http-audit-test.txt
    Expected: exit 0; fixture server evidence contains ok=true and failedImages=[].
    Evidence: evidence/task-3-http-audit-test.txt

  Scenario: script fails on blocked or 403 image
    Tool:     bash
    Steps:    node --test tests/homepage-image-http-audit.test.mjs --test-name-pattern "fails blocked or forbidden images" 2>&1 | tee evidence/task-3-http-audit-error.txt
    Expected: exit 0 for the test process; assertions confirm the child audit process exits non-zero and records blockedHost or HTTP 403 failure.
    Evidence: evidence/task-3-http-audit-error.txt
  ```

  Commit: YES | Message: `test(images): add homepage image HTTP audit` | Files: [`scripts/audit-homepage-images-http.mjs`, `tests/homepage-image-http-audit.test.mjs`]

- [ ] 4. Capture deployment hygiene, dirty-worktree, and rollback preflight

  What to do: Record the current dirty worktree, classify files outside this plan's allowed deployment scope, verify Vercel CLI availability/authentication without deploying, and capture current production headers for rollback/context. If unrelated dirty files remain, set `deployMode` to `clean_worktree_required` and plan Task 7 to deploy from a fresh `git worktree` at committed `HEAD`.
  Must NOT do: Do not revert, reset, stash, delete, or deploy in this task. Do not write credentials to evidence.

  Parallelization: Can parallel: YES | Wave 1 | Blocks: [5, 7] | Blocked by: []

  References (executor has NO interview context - be exhaustive):
  - Pattern:  `docs/deployment-checklist.md:5` - existing checklist warns not to claim live freshness without deployment checks and cache/purge evidence.
  - Pattern:  `docs/deployment-checklist.md:57` - existing production verification checklist includes live smoke checks and image rendering.
  - Pattern:  `vercel.json:1` - Vercel framework/build/output configuration.
  - Pattern:  `package.json:17` - production build command runs static image prep before Astro build.
  - External: `https://vercel.com/docs/cli` - Vercel CLI authentication and version reference.
  - External: `https://vercel.com/docs/cli/link` - Vercel project linking reference.
  - External: `https://vercel.com/docs/cli/pull` - Vercel environment/project settings sync reference.

  Acceptance criteria (agent-executable only):
  - [ ] `git status --short > evidence/task-4-git-status-before.txt` records current dirty state.
  - [ ] `git diff --name-only > evidence/task-4-diff-files.txt` records tracked changed files.
  - [ ] `git ls-files --others --exclude-standard > evidence/task-4-untracked-files.txt` records untracked files.
  - [ ] A JSON classifier at `evidence/task-4-deploy-scope.json` records `deployMode: "clean_worktree_required"` if any dirty/untracked file is outside the allowed files for Tasks 1-3 and Task 8.
  - [ ] `curl -sS -D evidence/task-4-current-prod-headers.txt -o evidence/task-4-current-prod-home.html https://www.computecurrent.com/` exits 0 and captures current production homepage status.
  - [ ] `if command -v vercel >/dev/null; then vercel --version; else npx --yes vercel --version; fi > evidence/task-4-vercel-version.txt` exits 0.
  - [ ] `bash -lc 'args=(); if [ -n "${VERCEL_TOKEN:-}" ]; then args+=(--token "$VERCEL_TOKEN"); fi; if command -v vercel >/dev/null; then vercel whoami "${args[@]}"; else npx --yes vercel whoami "${args[@]}"; fi' > evidence/task-4-vercel-whoami.txt` exits 0 or records a credential blocker that must be resolved before Task 7.

  QA scenarios (MANDATORY - task incomplete without these):
  ```
  Scenario: dirty worktree is classified before deployment
    Tool:     bash
    Steps:    node --input-type=module -e "import fs from 'node:fs'; const allowed=new Set(['plans/computecurrent-missing-images-vercel.md','scripts/lib/article-image-surface.mjs','tests/article-image-source-fallback.test.mjs','tests/public-image-display.test.mjs','tests/image-output.test.mjs','scripts/audit-homepage-images-http.mjs','tests/homepage-image-http-audit.test.mjs','docs/missing-images-vercel-report.md']); const files=[...fs.readFileSync('evidence/task-4-diff-files.txt','utf8').trim().split(/\n/).filter(Boolean),...fs.readFileSync('evidence/task-4-untracked-files.txt','utf8').trim().split(/\n/).filter(Boolean)]; const unrelated=files.filter((file)=>!allowed.has(file)&&!file.startsWith('evidence/')); const result={deployMode:unrelated.length?'clean_worktree_required':'current_worktree_allowed',unrelatedCount:unrelated.length,unrelated}; fs.writeFileSync('evidence/task-4-deploy-scope.json', JSON.stringify(result,null,2)+'\n'); console.log(JSON.stringify(result));"
    Expected: exit 0; JSON exists and records whether clean worktree deployment is required.
    Evidence: evidence/task-4-deploy-scope.json

  Scenario: production preflight is read-only
    Tool:     bash
    Steps:    curl -sS -D evidence/task-4-current-prod-headers.txt -o evidence/task-4-current-prod-home.html https://www.computecurrent.com/
    Expected: exit 0; headers file contains an HTTP status line and no deployment is triggered.
    Evidence: evidence/task-4-current-prod-headers.txt
  ```

  Commit: NO | Message: `chore(deploy): capture image deploy preflight` | Files: [`evidence/task-4-*`]

- [ ] 5. Run static image, focused test, build, and rendered-output verification

  What to do: Run the full local verification chain after Tasks 1-4. Confirm generated assets for all five affected IDs exist, focused image tests pass, public image audit passes, build passes, rendered homepage HTML contains no `hpcwire.com` image sources, and rendered public output audit passes.
  Must NOT do: Do not deploy, purge production cache, or change data fields by hand. If `npm run prepare:static-images` writes JSON or assets, inspect and keep only scoped, expected changes.

  Parallelization: Can parallel: NO | Wave 2 | Blocks: [6, 7] | Blocked by: [1, 2, 3, 4]

  References (executor has NO interview context - be exhaustive):
  - Pattern:  `package.json:14` - `prepare:static-images` command.
  - Pattern:  `package.json:17` - `build` command includes dashboard sync, static image preparation, and Astro build.
  - Pattern:  `package.json:51` - `audit:public-images` command.
  - Pattern:  `package.json:56` - `audit:public` includes rendered output/public copy/article/homepage/feed audits.
  - Pattern:  `scripts/prepare-static-images.mjs:111` - fallback images are ensured.
  - Pattern:  `scripts/prepare-static-images.mjs:197` - per-item refresh and canonical image set creation.
  - Pattern:  `scripts/audit-public-images.mjs:50` - public image audit entry point.
  - Pattern:  `scripts/lib/rendered-output-audit.mjs:166` - rendered public output audit entry point.

  Acceptance criteria (agent-executable only):
  - [ ] `node --input-type=module -e "import fs from 'node:fs'; const ids=['0ccf1e3f69f2b513','0737340e51a0cfb0','e40a1864f5a8b8e8','4d21b727a5d2e275','cf753845198cd7d0']; const missing=ids.filter((id)=>!fs.existsSync('public/generated/'+id+'.svg')); if (missing.length) { console.error(JSON.stringify({missing})); process.exit(1); } console.log(JSON.stringify({ok:true, ids}));" | tee evidence/task-5-affected-assets.json` exits 0.
  - [ ] `npm run prepare:static-images 2>&1 | tee evidence/task-5-prepare-static-images.txt` exits 0.
  - [ ] `node --test tests/article-image-source-fallback.test.mjs tests/public-image-display.test.mjs tests/image-output.test.mjs tests/homepage-image-http-audit.test.mjs 2>&1 | tee evidence/task-5-focused-tests.txt` exits 0.
  - [ ] `npm run audit:images 2>&1 | tee evidence/task-5-audit-images.txt` exits 0.
  - [ ] `npm run build 2>&1 | tee evidence/task-5-build.txt` exits 0.
  - [ ] `node ./scripts/audit-rendered-public-output.mjs 2>&1 | tee evidence/task-5-rendered-output-audit.txt` exits 0.
  - [ ] `node --input-type=module -e "import fs from 'node:fs'; const html=fs.readFileSync('dist/index.html','utf8'); const imgs=[...html.matchAll(/<img\b[^>]*\bsrc=[\"']([^\"']+)[\"']/gi)].map((m)=>m[1]); const bad=imgs.filter((src)=>/hpcwire\.com/i.test(src)); if (bad.length) { console.error(JSON.stringify({bad},null,2)); process.exit(1); } console.log(JSON.stringify({ok:true,imageCount:imgs.length}));" | tee evidence/task-5-dist-homepage-images.json` exits 0.

  QA scenarios (MANDATORY - task incomplete without these):
  ```
  Scenario: built homepage has no HPCwire image URLs
    Tool:     bash
    Steps:    node --input-type=module -e "import fs from 'node:fs'; const html=fs.readFileSync('dist/index.html','utf8'); const imgs=[...html.matchAll(/<img\b[^>]*\bsrc=[\"']([^\"']+)[\"']/gi)].map((m)=>m[1]); const bad=imgs.filter((src)=>/hpcwire\.com/i.test(src)); if (bad.length) { console.error(JSON.stringify({bad},null,2)); process.exit(1); } console.log(JSON.stringify({ok:true,imageCount:imgs.length}));" | tee evidence/task-5-dist-homepage-images.json
    Expected: exit 0; JSON evidence has ok=true and imageCount greater than 0.
    Evidence: evidence/task-5-dist-homepage-images.json

  Scenario: build or audit fails cleanly on regression
    Tool:     bash
    Steps:    node ./scripts/audit-rendered-public-output.mjs 2>&1 | tee evidence/task-5-rendered-output-audit.txt
    Expected: exit 0; if it exits non-zero, evidence contains the exact broken image/card failure and implementation must return to Task 1 or Task 2.
    Evidence: evidence/task-5-rendered-output-audit.txt
  ```

  Commit: NO | Message: `chore(images): verify static image build` | Files: [`evidence/task-5-*`, `dist/`]

- [ ] 6. Execute local preview browser and HTTP QA (C001/C002)

  What to do: Start a local preview server from `dist`, wait for it to answer, run the new HTTP image audit against the local homepage, capture a Chrome-driven screenshot, and cleanly stop the preview server. This task satisfies C001 local browser and C002 local HTTP known-broken replacement checks.
  Must NOT do: Do not leave preview servers running. Do not use production URLs in this task.

  Parallelization: Can parallel: NO | Wave 3 | Blocks: [7] | Blocked by: [5]

  References (executor has NO interview context - be exhaustive):
  - Pattern:  `package.json:19` - `preview` command.
  - Pattern:  `src/pages/index.astro:51` - homepage renders featured and latest feeds from public signals.
  - Pattern:  `src/components/LatestAnalysisFeed.astro:24` - article cards receive `item.publicSignal`.
  - Pattern:  `src/components/ArticleCardImage.astro:26` - final `<img>` element renders selected image source.
  - Test:     `scripts/audit-homepage-images-http.mjs` - new reusable HTTP image audit from Task 3.

  Acceptance criteria (agent-executable only):
  - [ ] Preview server starts on `http://127.0.0.1:4321/`.
  - [ ] `node scripts/audit-homepage-images-http.mjs --base-url http://127.0.0.1:4321 --blocked-host hpcwire.com --require-src /generated/0ccf1e3f69f2b513.svg --require-src /generated/e40a1864f5a8b8e8.svg --require-src /generated/4d21b727a5d2e275.svg --require-src /generated/cf753845198cd7d0.svg --out evidence/task-6-local-homepage-images.json` exits 0.
  - [ ] Chrome screenshot command writes `evidence/task-6-local-homepage.png` with non-zero size.
  - [ ] Cleanup command proves no process remains listening on port 4321.

  QA scenarios (MANDATORY - task incomplete without these):
  ```
  Scenario: local homepage images all return HTTP 200
    Tool:     bash
    Steps:    bash -lc 'mkdir -p evidence; npm run preview -- --host 127.0.0.1 --port 4321 > evidence/task-6-preview.log 2>&1 & pid=$!; trap "kill $pid 2>/dev/null || true" EXIT; node --input-type=module -e "for (let i=0;i<40;i++){try{const r=await fetch(\"http://127.0.0.1:4321/\"); if(r.ok) process.exit(0);}catch{} await new Promise(r=>setTimeout(r,250));} process.exit(1);"; node scripts/audit-homepage-images-http.mjs --base-url http://127.0.0.1:4321 --blocked-host hpcwire.com --require-src /generated/0ccf1e3f69f2b513.svg --require-src /generated/e40a1864f5a8b8e8.svg --require-src /generated/4d21b727a5d2e275.svg --require-src /generated/cf753845198cd7d0.svg --out evidence/task-6-local-homepage-images.json'
    Expected: exit 0; JSON has ok=true, blockedSources=[], failedImages=[], and required src values present.
    Evidence: evidence/task-6-local-homepage-images.json

  Scenario: local homepage renders in Chrome
    Tool:     playwright(real Chrome)
    Steps:    bash -lc 'mkdir -p evidence; npm run preview -- --host 127.0.0.1 --port 4321 > evidence/task-6-preview-chrome.log 2>&1 & pid=$!; trap "kill $pid 2>/dev/null || true" EXIT; node --input-type=module -e "for (let i=0;i<40;i++){try{const r=await fetch(\"http://127.0.0.1:4321/\"); if(r.ok) process.exit(0);}catch{} await new Promise(r=>setTimeout(r,250));} process.exit(1);"; npx --yes -p playwright@latest node --input-type=module -e "import { chromium } from '"'"'playwright'"'"'; import fs from '"'"'node:fs'"'"'; const browser=await chromium.launch({channel:'"'"'chrome'"'"', headless:true}); const page=await browser.newPage({viewport:{width:1440,height:1200}}); await page.goto('"'"'http://127.0.0.1:4321/'"'"', {waitUntil:'"'"'networkidle'"'"'}); await page.screenshot({path:'"'"'evidence/task-6-local-homepage.png'"'"', fullPage:true}); const bad=await page.$$eval('"'"'img'"'"', imgs=>imgs.map(img=>img.currentSrc||img.src).filter(src=>/hpcwire\\.com/i.test(src))); await browser.close(); if (bad.length) { console.error(JSON.stringify({bad})); process.exit(1); } if (!fs.statSync('"'"'evidence/task-6-local-homepage.png'"'"').size) process.exit(1);"'
    Expected: exit 0; screenshot exists and evaluated image sources contain no hpcwire.com URLs. If Chrome is not available, download and use agent-browser from https://github.com/vercel-labs/agent-browser for the same URL, screenshot, and image-source assertions.
    Evidence: evidence/task-6-local-homepage.png
  ```

  Commit: NO | Message: `test(images): verify local homepage image rendering` | Files: [`evidence/task-6-*`]

- [ ] 7. Deploy the scoped verified build to Vercel production

  What to do: Ensure Tasks 1-6 are committed or otherwise present at `HEAD`; if Task 4 classified unrelated dirty state, deploy from a fresh clean `git worktree` at `HEAD`. Pull/link Vercel production settings, run a production build in the deployment directory, deploy with `vercel deploy --prod --yes`, wait for inspect/build logs, and capture production error logs.
  Must NOT do: Do not deploy from a worktree containing unrelated dirty/untracked changes. Do not paste or commit tokens. Do not deploy if Task 6 evidence is missing or failing.

  Parallelization: Can parallel: NO | Wave 4 | Blocks: [8] | Blocked by: [6]

  References (executor has NO interview context - be exhaustive):
  - Pattern:  `vercel.json:1` - Vercel uses Astro, `npm run build`, and `dist`.
  - Pattern:  `package.json:17` - production build command.
  - Pattern:  `docs/deployment-checklist.md:57` - production verification requirements.
  - External: `https://vercel.com/docs/projects/deploy-from-cli` - official CLI production deployment workflow.
  - External: `https://vercel.com/docs/cli/deploy` - `vercel deploy --prod` reference.
  - External: `https://vercel.com/docs/cli/inspect` - deployment inspect, `--wait`, and `--logs`.
  - External: `https://vercel.com/docs/cli/logs` - production logs and deployment log filtering.
  - External: `https://vercel.com/docs/cli/global-options` - token and CI/project ID options.

  Acceptance criteria (agent-executable only):
  - [ ] `test -s evidence/task-6-local-homepage-images.json && test -s evidence/task-6-local-homepage.png` exits 0.
  - [ ] A deployment directory is recorded in `evidence/task-7-deploy-dir.txt`.
  - [ ] `npm run build 2>&1 | tee evidence/task-7-deploy-build.txt` exits 0 inside the deployment directory.
  - [ ] `vercel pull --yes --environment=production` or the token-aware equivalent exits 0 inside the deployment directory, unless `.vercel/project.json` is already present and inspectable.
  - [ ] `vercel deploy --prod --yes` or the token-aware equivalent writes a deployment URL to `evidence/task-7-vercel-deploy-url.txt`.
  - [ ] `vercel inspect <deployment-url> --wait --logs > evidence/task-7-vercel-inspect.txt` exits 0 and shows a ready production deployment.
  - [ ] `vercel logs --environment production --deployment <deployment-url> --level error --since 10m > evidence/task-7-vercel-errors.txt` exits 0 or records no deployment errors.

  QA scenarios (MANDATORY - task incomplete without these):
  ```
  Scenario: deploy from clean committed state
    Tool:     bash
    Steps:    bash -lc 'mkdir -p evidence; deploy_dir="../compute-current-image-fix-deploy-$(date +%Y%m%d%H%M%S)"; git worktree add "$deploy_dir" HEAD; printf "%s\n" "$deploy_dir" > evidence/task-7-deploy-dir.txt; cd "$deploy_dir"; npm ci 2>&1 | tee ../New\ project\ 2/evidence/task-7-npm-ci.txt; npm run build 2>&1 | tee ../New\ project\ 2/evidence/task-7-deploy-build.txt'
    Expected: exit 0; deploy directory exists, is a clean worktree at HEAD, and build passes.
    Evidence: evidence/task-7-deploy-build.txt

  Scenario: Vercel production deployment completes
    Tool:     bash
    Steps:    bash -lc 'deploy_dir="$(cat evidence/task-7-deploy-dir.txt)"; cd "$deploy_dir"; args=(); if [ -n "${VERCEL_TOKEN:-}" ]; then args+=(--token "$VERCEL_TOKEN"); fi; if [ ! -f .vercel/project.json ]; then vercel pull --yes --environment=production "${args[@]}"; fi; vercel deploy --prod --yes "${args[@]}" | tee ../New\ project\ 2/evidence/task-7-vercel-deploy-url.txt; deployment_url="$(tail -n 1 ../New\ project\ 2/evidence/task-7-vercel-deploy-url.txt)"; vercel inspect "$deployment_url" --wait --logs "${args[@]}" | tee ../New\ project\ 2/evidence/task-7-vercel-inspect.txt; vercel logs --environment production --deployment "$deployment_url" --level error --since 10m "${args[@]}" | tee ../New\ project\ 2/evidence/task-7-vercel-errors.txt'
    Expected: exit 0; deployment URL is captured; inspect completes without build failure; production error log evidence is captured.
    Evidence: evidence/task-7-vercel-inspect.txt
  ```

  Commit: NO | Message: `chore(deploy): deploy image fix to production` | Files: [`evidence/task-7-*`]

- [ ] 8. Verify production images and write cleanup/deployment report

  What to do: Run live HTTP image audit against `https://www.computecurrent.com`, capture a Chrome-driven production screenshot, run the existing production surface harness, confirm no `hpcwire.com` image URLs remain, confirm all live homepage images return HTTP 200, write `docs/missing-images-vercel-report.md`, and clean up local preview/deployment worktree resources.
  Must NOT do: Do not claim completion if production still returns any `hpcwire.com` image URL, any image HTTP status is non-2xx, or Vercel inspect/log evidence shows deployment errors.

  Parallelization: Can parallel: NO | Wave 5 | Blocks: [Final] | Blocked by: [7]

  References (executor has NO interview context - be exhaustive):
  - Pattern:  `scripts/verify-production-surface.mjs:186` - existing live/local production verification harness.
  - Pattern:  `docs/production-verification-report.md:1` - existing production verification report style.
  - Pattern:  `docs/deployment-checklist.md:63` - image rendering and live smoke checks are required before claiming production verification.
  - Test:     `scripts/audit-homepage-images-http.mjs` - new HTTP image audit from Task 3.
  - External: `https://vercel.com/docs/cli/logs` - production log evidence reference.

  Acceptance criteria (agent-executable only):
  - [ ] `node scripts/audit-homepage-images-http.mjs --base-url https://www.computecurrent.com --blocked-host hpcwire.com --require-src /generated/0ccf1e3f69f2b513.svg --require-src /generated/e40a1864f5a8b8e8.svg --require-src /generated/4d21b727a5d2e275.svg --require-src /generated/cf753845198cd7d0.svg --out evidence/task-8-production-homepage-images.json` exits 0.
  - [ ] `node scripts/verify-production-surface.mjs --local-dist dist --live https://www.computecurrent.com --out docs/production-verification-report.md --json evidence/task-8-production-surface.json 2>&1 | tee evidence/task-8-production-surface.txt` exits 0 or records only documented cache-purge credential skips.
  - [ ] Chrome screenshot command writes `evidence/task-8-production-homepage.png` with non-zero size and no `hpcwire.com` image source.
  - [ ] `docs/missing-images-vercel-report.md` lists changed files, commands/evidence paths, deployment URL, production pass/fail results, cleanup receipts, and remaining risks.
  - [ ] Any deployment worktree created in Task 7 is removed with `git worktree remove <path>` only after all evidence has been copied back.

  QA scenarios (MANDATORY - task incomplete without these):
  ```
  Scenario: production homepage images all return HTTP 200
    Tool:     bash
    Steps:    node scripts/audit-homepage-images-http.mjs --base-url https://www.computecurrent.com --blocked-host hpcwire.com --require-src /generated/0ccf1e3f69f2b513.svg --require-src /generated/e40a1864f5a8b8e8.svg --require-src /generated/4d21b727a5d2e275.svg --require-src /generated/cf753845198cd7d0.svg --out evidence/task-8-production-homepage-images.json
    Expected: exit 0; JSON has ok=true, failedImages=[], blockedSources=[], and required local image src values present.
    Evidence: evidence/task-8-production-homepage-images.json

  Scenario: production homepage renders in Chrome
    Tool:     playwright(real Chrome)
    Steps:    npx --yes -p playwright@latest node --input-type=module -e "import { chromium } from 'playwright'; import fs from 'node:fs'; const browser=await chromium.launch({channel:'chrome', headless:true}); const page=await browser.newPage({viewport:{width:1440,height:1200}}); await page.goto('https://www.computecurrent.com/', {waitUntil:'networkidle'}); await page.screenshot({path:'evidence/task-8-production-homepage.png', fullPage:true}); const bad=await page.$$eval('img', imgs=>imgs.map(img=>img.currentSrc||img.src).filter(src=>/hpcwire\\.com/i.test(src))); await browser.close(); if (bad.length) { console.error(JSON.stringify({bad})); process.exit(1); } if (!fs.statSync('evidence/task-8-production-homepage.png').size) process.exit(1);"
    Expected: exit 0; screenshot exists and evaluated image sources contain no hpcwire.com URLs. If Chrome is not available, download and use agent-browser from https://github.com/vercel-labs/agent-browser for the same URL, screenshot, and image-source assertions.
    Evidence: evidence/task-8-production-homepage.png
  ```

  Commit: YES | Message: `docs(deploy): record production image fix evidence` | Files: [`docs/missing-images-vercel-report.md`, `docs/production-verification-report.md`]

## Final verification wave (MANDATORY - after all implementation tasks)
> Runs in PARALLEL. ALL must APPROVE. Surface results to the caller and wait for an explicit "okay" before declaring complete.
- [ ] F1. Plan compliance audit - every task done, every acceptance criterion met
- [ ] F2. Code quality review - diagnostics clean, idioms match, no dead code
- [ ] F3. Real manual QA - every QA scenario executed with evidence captured
- [ ] F4. Scope fidelity - nothing extra shipped beyond Must-Have, nothing Must-NOT-Have introduced

## Commit strategy
- One logical change per commit. Conventional Commits (`<type>(<scope>): <subject>`) plus Lore trailers in the body/footer.
- Atomic: every commit builds and passes its focused tests on its own.
- No "WIP" / "fix typo squash later" commits on the final branch - clean up before merge.
- Reference the plan file path in the final implementation commit footer: `Plan: plans/computecurrent-missing-images-vercel.md`.
- Every commit body must include useful Lore trailers where applicable:
  - `Constraint: no runtime network validation in image selector`
  - `Rejected: hpcwire-only blocklist | shared displayability rule is less brittle`
  - `Confidence: high|medium`
  - `Scope-risk: narrow|moderate`
  - `Tested: <focused command/evidence>`
  - `Not-tested: <known gap, or none>`

## Success criteria
- All Must-Have shipped; all QA scenarios pass with captured evidence; F1-F4 approved; commit history clean.
- Local preview and production homepage emit no `hpcwire.com` image URLs in `<img src>`.
- All homepage image URLs return HTTP 2xx locally and on `https://www.computecurrent.com`.
- Vercel production deployment is inspected successfully and deployment logs show no image-fix-related errors.
