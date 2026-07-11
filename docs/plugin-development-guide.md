# Plugin development guide

## Add a provider

1. Choose one existing contract and a namespaced plugin ID.
2. Add the implementation under the matching `src/plugins` directory.
3. Export one manifest and one factory; do not read global environment variables inside
   business methods.
4. Declare a closed JSON configuration schema with required fields and no secret values.
5. Return typed `Result` values with provenance and retry classification.
6. Add the plugin to the application composition root, not the orchestrator.
7. Add contract, health, failure, idempotency, and redaction tests.
8. Add a migration version only when persisted plugin state changes.
9. Run the plugin permission and outbound-access review.

## Composition example

```js
const registry = createPluginRegistry({ logger, clock, metrics, secrets });
registry.register(rssSourcePlugin(config.sources));
registry.register(openAiImage2Plugin(config.images));
registry.register(postgresStoragePlugin(config.database));

const orchestrator = createContentOrchestrator({ registry, policy, clock, logger });
```

No `createContentOrchestrator` edit is permitted when adding a source, image provider,
writer, classifier, storage adapter, or publisher.

## Security checklist

- Use the shared safe HTTP adapter; never call `fetch` directly for source-controlled URLs.
- Never resolve private, loopback, link-local, multicast, or reserved destinations.
- Revalidate every redirect and cap redirects, bytes, decompressed bytes, and elapsed time.
- Do not accept active URL schemes or user-controlled local filesystem paths.
- Decode and re-encode media; enforce file, pixel, dimension, and MIME limits.
- Obtain secrets through the secret resolver and redact all structured errors.
- Use parameterized database calls and transactions.
- Mark health failures with internal codes, not credential or environment names.

## Reliability checklist

- Define deterministic identity and idempotency behavior.
- Classify retryable and permanent errors.
- Honor the provided abort signal and deadline.
- Emit correlation, run, source, and article IDs without sensitive payloads.
- Preserve the previous public state on failure.
- Include an offline test double and a failing-health fixture.

## Editorial checklist

- Preserve exact source facts and uncertainty.
- Include reason codes for relevance, taxonomy, route, and rejection.
- Do not promote based on homepage volume.
- Do not create deterministic fallback long form.
- Compare final public language with the recent publication corpus.
- Record model/provider and prompt-policy versions without exposing them publicly.

## Storage and migration checklist

- Keep migrations forward ordered and repeat-safe.
- Wrap state, revision, publication, and audit changes in one transaction.
- Use expected versions for edits and publications.
- Preserve soft-deleted records and immutable revisions.
- Provide import/export validation and a dry-run report.
- Test persistence in a fresh process, not only inside one test instance.

## Review gate

A plugin is enabled only after configuration validation, contract tests, threat review,
health check, and preview smoke test pass. Third-party plugins are not automatically
installed. Code, permissions, network access, dependency licenses, and secret scope must
be reviewed first.
