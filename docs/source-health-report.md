# Source health report

Recorded: 2026-07-11. This is a point-in-time direct feed check with an eight-second
request budget plus a semantic-scope review of `config/sourceRegistry.yml`.

## Availability summary

- Registered feeds: 27.
- Successful/reachable during the audit: 24.
- Failed or unsafe redirect behavior: 3.
- `The Register` returned 404.
- `HPCwire` returned 403.
- `insideHPC` failed with a fetch `TypeError`.
- `Capacity Media` responded but redirected its configured HTTPS URL to insecure HTTP;
  it is counted reachable but must be blocked until the redirect is repaired or approved.

Availability alone is not publication eligibility. A healthy connector may still
produce semantically irrelevant items.

## Scope tiers

| Tier | Sources | Policy |
| --- | --- | --- |
| Core infrastructure | Data Center Dynamics, Data Center Frontier, Uptime Institute Journal, Utility Dive, Power Engineering, Data Center Knowledge, Data Center POST | Eligible for core classification after item-level evidence checks |
| Compute and components | NVIDIA Blog, ServeTheHome, Semiconductor Engineering, HPCwire, insideHPC, Blocks & Files, StorageReview | Require enterprise/AI infrastructure decision evidence; reject consumer/novelty items |
| Cloud and network | Google Cloud Blog, AWS News Blog, Microsoft Azure Blog, Cloudflare Blog, Engineering at Meta, Capacity Media | Require concrete capacity, region, network, deployment, power, or infrastructure evidence |
| Broad editorial | SiliconANGLE, Bloomberg Technology, TechCrunch AI, VentureBeat AI, Tom's Hardware, Hugging Face Blog, The Register | Never default to core; item-level classifier must prove a concrete infrastructure decision |

The current registry assigns broad feeds default categories such as `AI Infrastructure
(GPU/Neocloud)`. That default is unsafe. A default category may seed review but cannot
become a public routing decision.

## Confirmed quality risks

- Tom's Hardware all-feed admits consumer gaming and novelty builds.
- TechCrunch AI, VentureBeat AI, Hugging Face, and SiliconANGLE feeds include general AI
  applications and software outside the product boundary.
- Vendor blogs mix infrastructure announcements with product marketing and tutorials.
- Storage and security coverage is relevant only when directly connected to AI or data
  center deployment decisions.
- Current broad keyword rules accept isolated mentions of GPU, chip, storage, or power.
- Feed status has no durable failure history, persisted circuit state, or verified last-good
  timestamp in the canonical public model. Redirects are now revalidated by the shared safe HTTP
  adapter; source requests also have bounded retry, per-origin spacing, and an in-process circuit.

## Required health model

Each source needs a persisted health record with source ID, checked URL, final validated
URL, DNS/IP decision, status code, content type, bytes, latency, item count, extraction
success rate, relevance precision, last success, consecutive failures, circuit state,
and redacted error code. Health output must not include secrets or full response bodies.

Source fetches must use the shared safe HTTP adapter. Only HTTP(S) is accepted; HTTPS to
HTTP downgrade, private/reserved destinations, unvalidated redirects, oversized bodies,
and unsupported content types fail closed.

## Release actions

1. Quarantine the three failed feeds and the Capacity Media downgrade until a fresh
   health check passes.
2. Remove registry default category as a public decision input.
3. Add per-source precision metrics to the 150-item relevance benchmark.
4. Apply stricter core evidence requirements to all broad editorial and component feeds.
5. Persist the current in-process circuit metrics and last-good state across serverless instances.
6. Re-run the report from CI and preview before enabling a repaired connector.
