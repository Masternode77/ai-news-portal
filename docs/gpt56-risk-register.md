# GPT-5.6 upgrade risk register

| ID | Risk | Likelihood | Impact | Control and acceptance evidence |
| --- | --- | --- | --- | --- |
| R1 | Parallel engines continue writing incompatible article shapes | High | High | One orchestrator and registry; write-call inventory; legacy wrapper tests |
| R2 | Relevance repair suppresses valid adjacent infrastructure coverage | Medium | High | 150 labeled fixtures; per-class precision/recall and reason codes |
| R3 | Legacy data cannot migrate to the canonical state machine | Medium | High | Versioned importer, dry-run report, rollback snapshot, deterministic re-run |
| R4 | Build rewrites source and makes verification non-reproducible | High | High | Pure build, generated-data job separation, clean-tree assertion |
| R5 | SSRF exposes runner or cloud metadata services | High | High | Central safe fetcher; private-IP/redirect/size tests |
| R6 | Stored editorial data executes in public or admin origin | Medium | High | Safe JSON/script serializer, URL sanitizer, CSP, XSS fixtures |
| R7 | Image provider failure is mislabeled as Image2 output | High | Medium | Explicit provenance enum/hash/provider metadata; fail/downgrade tests |
| R8 | CMS migration loses revisions or publishes partial state | Medium | High | Transactions, optimistic concurrency, immutable audit, restart E2E |
| R9 | Missing production credentials are mistaken for completed CMS | High | High | Fail closed; preview adapter evidence; explicit external blocker report |
| R10 | Static route count and repository assets continue growing | High | Medium | Thin-page suppression, pagination policy, object storage, route/size budgets |
| R11 | Dashboard-only automation causes deployment loops | High | Medium | Deployment ignore rule and workflow diff gate; deployment history proof |
| R12 | Operational pages remain discoverable through hidden references | Medium | Medium | Repository link audit, sitemap/RSS/schema audit, deployed 404/410 smoke test |
| R13 | Three prototypes expand scope without converging | Medium | Medium | Shared data/components, weighted scorecard, six-cycle cap, documented winner |
| R14 | Security headers break images/admin/API behavior | Medium | Medium | Report-only CSP baseline, route E2E, preview header audit |
| R15 | Node 22/24 mismatch causes preview-only failures | Medium | Medium | Align versions and test the same runtime in CI and Vercel |
| R16 | Broad cleanup removes undocumented external command callers | Medium | High | Compatibility wrappers, usage search, deprecation log, delayed deletion |
| R17 | Production rollback tag does not map to a deployable artifact | Low | High | Resolve tag SHA and run preview/rollback selection rehearsal before merge |
| R18 | Performance target is asserted without field-quality evidence | Medium | Medium | Lighthouse desktop/mobile, asset budgets, route count, Web Vitals trace |

## Release blockers

R1, R3, R4, R5, R6, R8, R9, R11, and R12 are release blockers. R9 can remain an
external blocker only if the integration and local/preview persistence tests pass and
the final report clearly states that production CRUD was not exercised.

## Rollback boundary

Before merge, every migration must be additive or have a tested down migration. Public
read models must remain compatible with the tagged baseline during the transition. A
failed preview gate stops the affected phase; it never triggers a production deploy.
