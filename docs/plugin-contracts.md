# Plugin contracts

## Manifest

Every plugin exports a manifest and one factory. Configuration is validated before the
factory runs.

```ts
interface PluginManifest {
  id: string;
  version: string;
  capabilities: string[];
  configSchema: JsonSchema;
  dependencies: Array<{ capability: string; optional?: boolean }>;
  enabled: boolean;
  migrationVersion: number;
  healthCheck(ctx: HealthContext): Promise<HealthResult>;
}

interface Plugin<T> {
  manifest: PluginManifest;
  create(ctx: PluginContext): Promise<T> | T;
}
```

IDs are lowercase namespaced strings such as `source.rss` or `image.openai-image2`.
Versions are semantic versions. Duplicate enabled providers for a singleton capability
are rejected unless the registry is given an explicit priority policy.

## Common results

Providers return data, warnings, and typed errors; they do not log secrets or silently
substitute a different capability.

```ts
type Result<T> =
  | { ok: true; value: T; warnings: ProviderWarning[]; provenance: Provenance }
  | { ok: false; error: ProviderError; retryable: boolean; quarantine?: boolean };

interface Provenance {
  providerId: string;
  providerVersion: string;
  inputHash: string;
  outputHash?: string;
  createdAt: string;
  correlationId: string;
}
```

## Required capabilities

```ts
interface SourceConnector {
  discover(cursor: Cursor | null, ctx: RunContext): Promise<Result<DiscoveryBatch>>;
  checkpoint(cursor: Cursor, ctx: RunContext): Promise<Result<void>>;
}

interface SourceExtractor {
  supports(item: SourceItem): boolean;
  extract(item: SourceItem, ctx: ExtractionContext): Promise<Result<ExtractedSource>>;
}

interface RelevanceProvider {
  classify(source: CleanSource, ctx: EditorialContext): Promise<Result<RelevanceDecision>>;
}

interface TaxonomyProvider {
  classify(source: CleanSource, relevance: RelevanceDecision): Promise<Result<TaxonomyDecision>>;
}

interface EntityProvider {
  extract(source: CleanSource): Promise<Result<EntityDecision[]>>;
}

interface ClusterProvider {
  assign(source: CleanSource, candidates: ClusterCandidate[]): Promise<Result<ClusterDecision>>;
}

interface EditorialWriter {
  evidence(input: EditorialInput): Promise<Result<EvidenceCard>>;
  angle(input: EditorialInput, evidence: EvidenceCard): Promise<Result<EditorialAngle>>;
  outline(input: EditorialInput, angle: EditorialAngle): Promise<Result<EditorialOutline>>;
  draft(input: DraftInput): Promise<Result<EditorialDraft>>;
}

interface EditorialReviewer {
  critique(draft: EditorialDraft, evidence: EvidenceCard): Promise<Result<Critique>>;
  rewrite(draft: EditorialDraft, critique: Critique): Promise<Result<EditorialDraft>>;
  diversity(draft: EditorialDraft, recent: PublishedArticle[]): Promise<Result<DiversityDecision>>;
}

interface SourceFidelityProvider {
  verify(draft: EditorialDraft, evidence: EvidenceCard): Promise<Result<FidelityDecision>>;
}

interface StorageAdapter {
  transaction<T>(work: (tx: StorageTransaction) => Promise<T>): Promise<T>;
  getArticle(id: string): Promise<ArticleRecord | null>;
  transition(input: TransitionInput): Promise<TransitionRecord>;
  appendRevision(input: RevisionInput): Promise<ArticleRevision>;
  queryPublic(input: PublicQuery): Promise<PublicPage>;
}

interface ImageProvider {
  generate(input: ImageRequest): Promise<Result<GeneratedMedia>>;
  healthCheck(ctx: HealthContext): Promise<HealthResult>;
}

interface AuthProvider {
  authenticate(input: CredentialInput): Promise<Result<Identity>>;
  authorize(identity: Identity, action: AdminAction, resource?: Resource): Promise<boolean>;
  createSession(identity: Identity, meta: SessionMeta): Promise<Result<Session>>;
  revokeSession(id: string): Promise<Result<void>>;
}

interface PublishAdapter {
  publish(article: PublishableArticle, expectedVersion: number): Promise<Result<Publication>>;
  unpublish(articleId: string, expectedVersion: number): Promise<Result<Publication>>;
  rebuildReadModel(scope: ReadModelScope): Promise<Result<ReadModelVersion>>;
}

interface AnalyticsProvider {
  record(event: AnalyticsEvent): Promise<Result<void>>;
}

interface NotificationProvider {
  notify(event: NotificationEvent): Promise<Result<void>>;
}
```

## Decision records

`RelevanceDecision` includes class (`core`, `adjacent`, `irrelevant`), confidence,
reason codes, infrastructure layers, and benchmark version. It may recommend a route but
cannot publish.

`EditorialAngle` names one source-specific thesis, reader, changed decision, suitable
route, limitation, and prohibited extrapolations. `EvidenceCard` distinguishes facts,
dates, numbers, entities, locations, source limitations, and unproven claims.

`GeneratedMedia` has an explicit provenance kind: `source`, `openai-image2`, `gemini`,
`local-editorial`, or `none`. Provider failure cannot be relabeled. Public labels derive
from this enum only.

## Registry contract

The registry validates manifests, schemas, capability dependencies, migration versions,
and health before a run. Resolution is deterministic and recorded in the pipeline run.
Secrets are passed through an opaque secret resolver and never copied into plugin config,
logs, transition reasons, read models, or health output.

The registry offers `register(plugin)`, `resolve(capability, selector?)`, `health()`, and
`describe()`. The orchestrator receives an already-built registry. Adding a provider
means adding and registering a plugin module; core orchestration source remains unchanged.
