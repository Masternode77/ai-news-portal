# Mac subscription activation follow-up — 2026-10-07 KST

## Release status

In progress. No new trial column has been published and the production
OpenRouter generation workflow has not yet been retired. The existing
`compute-current` Mac heartbeat was temporarily paused before its 00:45 KST
slot to prevent a concurrent writer during activation. Its original prompt,
schedule and target are preserved in the machine-local evidence directory.
Restore that same automation after the verified transition; do not create a
second automation.

Production was verified at `cb3ccc8370eb990c8e2f35b9a93587464bc885ef`, Vercel READY
deployment `dpl_mgZUrRc3AGFMFXgzgcJAJfsJzPRW`. Work continues on
`feat/subscription-astra-fable` in `/Users/josh/Documents/compute-current-subscription`.
The original main checkout remains preserved.

## Repairs and evidence

- Structured heading normalization now handles list commas without changing
  numeric comma grouping or the renderer's heading grammar.
- Extraction preserves up to 80 paragraphs and 24,000 characters. An actual
  limit hit remains long-form ineligible through nested extraction metadata,
  public artifact construction and JSON round trips. The authorized Kubernetes
  source grew from a clipped 1,757-character extract to 7,621 characters.
- Factual premises must distinguish motivating examples and potential use cases
  from measured configurations, results and established economic outcomes.
  Headings, metaphors and counterarguments obey the same source boundaries.
- Evidence repair uses exact, unambiguous body-block replacements. Unedited
  blocks are preserved. Current source-summary diagnostics identify the exact
  sentences measured by the unchanged gate. Independent differential review
  matched the old scorer on 500 of 500 generated inputs.
- Each of at most three editorial versions has two quality/format attempts.
  Only a typed Astra rejection opens another version. Every successful repair
  reruns deterministic checks and fresh Astra review; final rejection and
  authentication/transport failures stop without publishing.
- Publication stance follows the current headline and full deck through figure
  construction, quality checks and storage. Astra reviews actual visible figure
  copy and numbers too; internal figure indexes are excluded. Rejected model
  figure proposals are rebuilt from verified claims, with one unchanged prose
  patch allowed only for a pending rejected-model-figure reset.
- Model evidence no longer includes the older deterministic expert-insight
  template fields. Actual source text, metadata and verified claims remain.
- Fable uses the official CLI's high effort setting. Astra remains pinned to
  `gpt-6-astra`, and Fable to `claude-fable-5-1`. CLI authentication, API-key
  isolation, helper-model suppression and no-paid-fallback checks remain active.

Earlier repair continuations reused only exact-matching saved real requests
and responses, followed by fresh Fable/Astra calls; they are not represented as
all-fresh runs. Rejected outputs remain private in
`evidence/subscription-activation-2026-10-06/`. The fresh high-effort trial used
no replayed responses but failed the summary-ratio gate. Exact diagnostics now
reach the initial voice pass too. Its continuation passed that deterministic
gate but exposed further source-scope errors. The subsequent source-only trial
used eight all-new responses and passed deterministic prose checks, but its
final Astra review rejected residual scope claims and an incomplete figure
label. The figure builder had cut a verified statement at 96 characters;
complete nonnumeric fact labels now preserve the source statement and its
qualifiers. A bounded Astra source brief now precedes Fable drafting. Its cited URLs and
exact quotations are validated, and it separates reported facts, measurement
groups and intended uses. Final Astra review remains independent of the brief.
The fresh trial of this complete path is pending.

## Validation completed so far

- Source extraction and propagation: 71 focused tests passed.
- Authored column engine: 46 focused tests passed.
- Subscription routing: 41 focused tests passed.
- Subscription provider: 10 focused tests passed.
- Earlier full suite: 791 source tests and 22 built-page tests passed, plus
  quality, relevance, taxonomy and repetition checks; 96 pages built.
- Independent code review approved the heading/source fixes, exact-block
  repairs, unchanged summary scoring, and bounded review retries.
- A live second runner was rejected by the held common-Git operation lock
  before generation. The outer lock remains owned across activation.

The earlier full suite predates the final stance/figure review refinements and is
not substituted for final integration validation. Full local runner, final
source review, unique native artwork, content gate, automation activation and
production publication remain required.
