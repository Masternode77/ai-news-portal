# Security Fix Report

Updated: 2026-07-19

## Dependency Remediation

The `origin/main` baseline reported 18 npm findings (9 high, 9 moderate). The upgrade branch
uses the remediated lockfile and currently reports:

```text
npm audit --audit-level=low
found 0 vulnerabilities
```

## Application Remediation

- Closed active URL schemes and unsafe JSON-LD serialization on public surfaces.
- Removed public operational payloads and added deployment security/no-store headers.
- Added bounded JSON parsing, generic errors, CSRF, durable login throttle/revocation,
  strict admin/editor authorization, and invalid-role fail-closed behavior.
- Replaced scrypt configuration with Argon2id PHC hashes using 19 MiB memory, two iterations,
  and one lane; malformed or legacy formats fail closed. The parameters match the OWASP minimum
  Argon2id profile.
- Removed raw client IP persistence from CMS audit metadata; only an HMAC identifier remains.
- Added media signature/size/pixel validation, metadata stripping, object-key checks, and
  cleanup when metadata persistence fails. Production uploads remain private and are exposed
  publicly only through deterministic promotion during read-model export.
- Added Postgres transactions, optimistic concurrency, immutable revision/audit triggers,
  soft deletion, and a transactional publication outbox. Builds never acknowledge outbox
  events; they remain pending until a separately verified post-deployment consumer exists.
- Corrected auth/schema mismatches for user disablement and session role/update timestamps.
- Bound signed sessions to the configured username, role, and password hash so credential or
  authorization changes invalidate existing sessions. PostgreSQL-backed validation now compares
  the live user role, password hash, and disabled state on every authenticated request.
- Preserved account disablement during PostgreSQL login registration. A disabled account now
  aborts before a new durable session can be inserted.
- Restricted the ChatGPT image runtime to credential-free HTTPS endpoints. Provider-returned
  image URLs receive the OAuth bearer only when they use HTTPS and exactly match the configured
  runtime origin.
- Changed canonical JSON state reads to default only when a file is absent. Malformed JSON,
  incompatible top-level shapes, and other I/O failures now fail closed.
- Restricted Percy credentials to a manual workflow dispatch on `main`. Pull-request code never
  receives the token, Playwright and Percy are exact lockfile dependencies, and
  `npx --no-install` prevents an implicit package download.
- Pinned every third-party GitHub Actions invocation to an immutable 40-character commit SHA and
  added a repository-wide workflow regression test so mutable tags cannot return unnoticed.
- Added CMS ownership tombstones so unpublished or deleted CMS records cannot reappear from
  legacy JSON fallbacks, and blocked editor access to deleted records.
- Added bounded, no-follow source-image provenance reads, four-variant hash verification, staged
  repairs, and whole-batch rollback. Missing assets are repairable; unsafe paths, symlinks, source
  failures, or metadata conflicts fail before mutation.
- Added source-only reconciliation for newer upstream content. Generated copy, images, routing, and
  quality metadata are stripped; only registered HTTPS sources may be re-fetched through the
  canonical extraction and publication gates.
- Bound reconciliation checkpoints and receipts to the audited commit plus deterministic candidate
  digest. Mismatched retries and batches over 30 candidates fail before provider or checkpoint work.
- Preserved immutable reconciliation input for partial-publish recovery, validated payload/identity
  pairs at the production composition boundary, and serialized canonical commands with an
  exclusive tokenized lease outside cached checkpoint state.
- Reused one candidate constructor across audit, composition, and ingest so decoded entities,
  sanitizer rejection, stable IDs, and candidate fingerprints describe the same bytes.
- Added lease fencing before completed-output verification, provider calls, and checkpoint saves;
  a replaced token now invalidates the old owner without deleting the replacement lease.
- Discarded every upstream snippet, including feed text, so reconciliation must obtain new source
  evidence through the canonical extractor instead of inferring provenance from legacy projections.
- Restricted the initial source request and every redirect hop to the configured source registry;
  a public but unregistered redirect now fails closed.
- Removed automatic stale-lock takeover. An abandoned lease requires explicit operator cleanup,
  preventing a second process from publishing while an old owner may still be running.
- Bound durable publication receipts to execution identity, replayed completed identical identities
  without provider calls, and fenced every durable or public publish side effect before and after it.

## Verification

`npm test` ran 618 tests: 617 passed, none failed, and one intentional skip, followed by passing
quality, relevance, taxonomy, and repetition commands. The final focused security set passed
76/76, and the reconciliation/orchestrator security set passed 96/96. The local admin browser exercised all 17 lifecycle scenarios and commercial visual QA
passed all eight captures. The source-image provenance audit regenerated and matched all 104
hero, thumbnail, OpenGraph, and legacy variants across 26 public source-canonical articles.
`npm audit --audit-level=low` reports zero findings, the resolved dependency tree is valid, and a
structured tracked-file scan found no real credential or private-key candidates; its only match
was an `example.invalid` fixture. See `ultraqa-security-report.md` for the adversarial matrix.

## External Hardening

OAuth and 2FA are not implemented. Password authentication is therefore constrained by
Argon2id, durable lockout, CSRF, strict cookies, session revocation, and role checks. Vercel
Firewall, managed database backups, secret rotation, and least-privilege Blob/database
credentials must still be configured in the deployment account.
