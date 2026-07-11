# Legacy engine migration

## Objective

Converge on one content engine without deleting behavior before equivalence is proven.
The full inventory and status are in `gpt56-legacy-engine-map.md`.

## Phase 0: freeze and observe

- Preserve production SHA with the backup tag.
- Record every script that writes `src/data`, `public/generated`, or audit logs.
- Add pipeline provenance and state-transition records without changing public output.
- Make the build assert a clean source tree.
- Block timestamp-only dashboard changes from deployment.

Exit: the same input can be traced to its writer, version, state changes, and output.

## Phase 1: contracts and state

- Add contracts, registry, in-memory storage adapter, and state machine.
- Wrap proven source extraction, fidelity, relevance, and image primitives as plugins.
- Import existing records into versioned lifecycle states in dry-run mode.
- Compare imported public eligibility and URLs with the baseline.

Exit: contract/state tests pass and migration dry-run is deterministic.

## Phase 2: canonical read and write paths

- Route `content:ingest` through `content:publish` through one orchestrator.
- Make `npm run pipeline` a compatibility wrapper around `content:cycle`.
- Make legacy regeneration commands bounded wrappers that select records and invoke the
  canonical phases.
- Prevent legacy modules from independently writing canonical stores.
- Generate one versioned public read model for Astro, RSS, sitemap, taxonomy, and search.

Exit: write-call search finds only storage/publish adapters; output parity and new quality
benchmarks pass.

## Phase 3: editorial convergence

- Migrate evidence, angle, outline, drafting, critic, rewrite, fidelity, and diversity
  capabilities from the newer experimental modules.
- Disable Blog Engine v4, narrative DNA, public content v2, longform engine, humanizer,
  and autonomous desk orchestration entry points.
- Preserve useful leaf policies as canonical providers.
- Downgrade failed editorial items to Source Signal; never fabricate fallback long form.

Exit: 150 relevance fixtures and 40 writing fixtures pass, false-positive rate is below
5%, route/category accuracy meets the benchmark, and recent-copy diversity passes.

## Phase 4: storage and admin

- Import JSON records into the database adapter with immutable source IDs and revisions.
- Dual-read in preview only: compare DB query results to the JSON read model.
- Switch preview writes to DB/object storage and rebuild the public read model.
- Run full admin CRUD, restart persistence, publication, sitemap, and RSS E2E.
- Keep JSON export as rollback data; do not dual-write production indefinitely.

Exit: preview persistence survives restart and all mutation/audit contracts pass.

## Phase 5: deletion

- Search package scripts, workflows, imports, docs, and external automation for callers.
- Remove duplicate `* 2.mjs` provider snapshots and generic fallback modules first.
- Delete deprecated engines only after preview and one release-cycle observation window.
- Remove compatibility commands in a separate reviewable change.

Exit: no deprecated implementation can execute and no production or documented caller
references it.

## Data migration rules

- Never infer Image2 provenance from absence of a source label.
- Unknown generator/provider metadata migrates to `unknown` and is not publicly branded.
- Missing routing metadata is reclassified; it does not default to public eligibility.
- Published URLs remain stable unless explicitly quarantined for security or quality.
- Empty taxonomy pages are excluded from read models rather than deleted as entities.
- Every migration emits counts, rejected records, changed routes, hashes, and rollback IDs.

## Rollback

Before production cutover, export the canonical database/read model and retain the tagged
JSON revision. A failed read-model or admin gate restores the tagged deployment and stops
new writes. Database migrations require tested down migrations or an additive forward
repair. No rollback depends on force-pushing `main`.
