# Canonical architecture

## Decision

Compute Current retains Astro for its public and admin presentation. A framework
migration would not solve the content, persistence, or security defects and would add
release risk. One Node-compatible core orchestrator becomes the only production content
engine. Astro and serverless routes consume its contracts through adapters; they do not
own editorial policy.

## Boundaries

```text
src/core/contracts/       stable domain contracts and result types
src/core/registry/        plugin manifests, dependency resolution, configuration
src/core/orchestrator/    phase runner, retries, idempotency, transition policy
src/core/state/           lifecycle states, transition records, versioning
src/plugins/sources/      feed/source connectors
src/plugins/extractors/   source extraction implementations
src/plugins/editorial/    relevance, taxonomy, evidence, writer, reviewer, fidelity
src/plugins/images/       source and generated image providers
src/plugins/storage/      memory/test, JSON import/export, database/read-model adapters
src/plugins/auth/         local test and configured production auth providers
src/plugins/publishing/   public read-model and deployment adapters
src/adapters/             HTTP, clock, logger, metrics, queue and platform adapters
src/admin/                admin application services and route models
src/public/               public queries and presentation models
```

Existing `scripts/lib` modules are migrated incrementally into these boundaries. During
migration, compatibility adapters may import proven legacy primitives. The orchestrator
may import contracts and registry APIs only; it may never import source-, model-, image-,
or storage-specific implementations.

## Canonical lifecycle

```text
discovered -> fetched -> extracted -> clean_source
                         |             |
                         v             +-> low_relevance
                  extraction_failed    +-> duplicate
                                       +-> source_signal
                                       +-> editorial_candidate -> drafting
                                                                  |       |
                                                                  |       +-> review_failed
                                                                  v
                                                            publish_ready -> published
                                                                                |
                                                                                +-> unpublished
                                                                                +-> archived

Any eligible state -> quarantined -> archived or restored state
Any soft-deletable state -> deleted
```

Every transition stores article ID, previous and next state, actor, timestamp, reason
code and detail, pipeline version, source version, article version, idempotency key, and
correlation ID. The storage transaction updates the record and appends the transition
atomically. Illegal transitions fail closed.

## Orchestration

The orchestrator executes named phases:

1. `ingest`: discover immutable source item identity and raw metadata.
2. `extract`: use the safe HTTP adapter and extraction quality policy.
3. `classify`: relevance, taxonomy, entity extraction, and route reason codes.
4. `cluster`: deduplicate and attach a canonical event/cluster identity.
5. `generate`: create Evidence Card, Angle, Outline, Draft only for an editorial route.
6. `review`: Critic, Senior Rewrite, Fidelity and Diversity gates.
7. `publish`: transactionally publish or downgrade to Source Signal.

`publish` also builds the public query artifacts, RSS inputs, sitemap inputs, and search index;
there is no separate eighth production phase.

`content:cycle` invokes all phases. Phase commands invoke the same phase runner and
state store; none implements a separate pipeline. The current CLI exposes no batch,
retry, idempotency-namespace, or dry-run flags; those policies are internal to the
orchestrator and checkpoint contracts until a versioned command API is introduced.

## Editorial route policy

- **Source Signal:** clean and relevant source link with concise grounded context.
- **Editorial Brief:** 450-800 words and at least three source-backed facts.
- **Analyst Note:** 900-1,400 words with thesis, counterargument, and watch metrics.
- **Deep Dive:** 1,500-2,500 words, multi-source or manually approved.
- **Archive Only:** irrelevant, duplicate, dirty, stale, or insufficient evidence.

No quota can promote a weak item. If an editorial provider is unavailable or a draft
fails review, a clean relevant record becomes a Source Signal. The system never emits a
deterministic fallback long-form article.

## Data ownership

- Admin CMS state: transactional `StorageAdapter` using managed Postgres when configured
  and an isolated local/test adapter otherwise.
- Scheduled content-cycle state: versioned file checkpoints, publication receipts, and
  SHA-256 output bundles under the ignored `.cache/content-cycle` runtime boundary.
- Public delivery: tracked generated JSON and raster read models written only by the
  canonical publish phase; admin exports may supply the build-time read model when configured.
- Images: object storage through a media adapter, with content hash and provenance.
- JSON: the current static publication read model and rollback format, not the admin CMS database.
- GitHub: source code/release transport, not the CMS database.

The database schema includes users, sessions, articles, revisions, sources, source items,
source health, clusters, categories, tags, entities, pipeline runs, publication states,
quarantine reasons, media, and audit logs. Migrations are ordered, transactional where
supported, and recorded in a migration table.

## Security and reliability

All remote access goes through one safe HTTP adapter: HTTP(S) only, DNS resolution and
private/reserved IP rejection, redirect revalidation, timeouts, streamed byte limits,
content-type allowlists, and bounded decompression. Media is decoded and re-encoded into
supported raster formats with pixel limits.

Admin pages use server-authenticated routes, role policies, CSRF, durable rate limiting,
bounded bodies, optimistic revisions, soft delete, immutable audit records, and
`Cache-Control: no-store`. Public rendering uses script-safe JSON and HTTP(S)-only links.

Retries use exponential backoff with jitter and only retry classified transient errors.
Circuit state and failed jobs are persisted. Every job is idempotent; dead-lettered items
remain inspectable and cannot modify public state.

## Pure build and release

`npm run build` reads source/read-model artifacts and writes only ignored build output.
It must leave `git status` unchanged. Content ingestion, image generation, read-model
creation, and dashboard synchronization are explicit jobs. Dashboard timestamp-only
changes are excluded from the production deployment trigger.

Preview deploys run migrations against preview storage, tests, content evaluation,
rendered route audits, security checks, and visual QA. Production changes only after the
preview and rollback gates pass.
