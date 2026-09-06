# Codex images and capacity refinement

Baseline: verified Vercel v0.0.20 (41528967), September 6, 2026.

1. Remove active OpenAI API image authentication and model calls. Default to a Codex-managed local image handoff, consuming registered native Codex image outputs. Scheduled CI cannot call a desktop conversation. Missing registered artwork uses existing deterministic local art; never claim Codex generated a fallback.
2. Keep legacy image2 call sites compatible while routing them through the same no-network provider. Add a local import command that validates image bytes, article identity and a content fingerprint, creates the existing hero/thumbnail/OG variants, and records provenance. Do not transfer ChatGPT/Codex credentials to GitHub or Vercel.
3. Remove email subscription/provider/sender integration and permission-request drafts as the user requested. Preserve the on-site weekly digest and RSS as public reading surfaces. Send no messages.
4. Improve the capacity ledger with year/state filters, selected-unit/capacity totals, an empty state and reset. Preserve the complete server-rendered table for no-JavaScript readers.
5. Validate no-network image behavior, import integrity/stale-art rejection, removal contracts, capacity filter combinations, Astro types/build and desktop/mobile interaction. Review changes independently before the existing authorized commit/push/deploy path.

No dependencies or external services added. Existing editorial source, extraction, relevance and repetition gates remain intact.

## Verification and delivery

Implemented all five steps. No email was sent and no image API was called. Existing publication images were preserved.

- Astro check: zero errors/warnings (24 hints).
- Build: 91 pages. Built-output tests: 22/22. Quality and repetition gates passed.
- Source suite: 577/580 initially passed; failures were obsolete provider/model/document expectations (including a parent subtest failure). Corrected expectations and reran both affected suites: 15/15 passed.
- Codex registration tests: 6/6, including 6 concurrent registrations, no-network fallback, corruption/revision checks and error cleanup.
- Image surface checks: 34/34; explicit Codex/local provenance suite: 26/26.
- Browser: desktop/mobile TX 2026 filter = 121 units / 20,150.9 MW; empty/reset verified; no horizontal overflow or page errors. JavaScript-disabled page retains all 209 rows. Email enrollment controls absent.
- Exclusive locks record PID/time. A force-killed process requires the documented local recovery after verifying that owner process exited; live locks are never removed based on elapsed time alone.
