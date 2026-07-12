# GPT-5.6 Source Reliability Closure

## Scope

Add bounded reliability policy only at the outbound source-fetch boundary. Do not
change editorial routing, source fidelity, public data, or provider dependencies.

## Steps

- [x] Add deterministic tests for exponential backoff, per-source spacing, circuit
      opening/recovery, non-retryable failure, and aggregate metrics.
- [x] Implement an injectable `SourceRequestCoordinator` with no timers left alive.
- [x] Route `source-fetch.mjs` network requests through the coordinator while preserving
      fail-closed fallback extraction and SSRF/content-size guards.
- [x] Run source fetch, safe HTTP, content cycle, and full release gates.
- [x] Document which backend reliability requirements are direct controls versus
      checkpoint/dead-letter equivalents.

## Risks

- Retries can increase latency; attempts and delays are bounded.
- Global state can leak between tests; tests use isolated coordinator instances and the
  production singleton exposes metrics only.
- Circuit keys use source origin, not full URLs, to avoid leaking paths or query strings.
- Rollback is one local commit; no production or managed service action is included.
