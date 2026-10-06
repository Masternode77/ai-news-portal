# Mac subscription activation follow-up — 2026-10-07 KST

## Release status

The verified column and native artwork are live on `www.computecurrent.com`.
Release `v0.0.40`, commit `9f906242a8d272bf897b194341e9bdcf8a3be5ee`, reached
Vercel READY deployment `dpl_57SHcQ2bKHQtKxHX7ktRus8dG41G`; the column page
and hero image both returned HTTP 200. The original production baseline was
`cb3ccc8370eb990c8e2f35b9a93587464bc885ef`.

The existing `compute-current` heartbeat now has the reviewed subscription
instructions, with its original ID, target thread and 00:45/08:45/16:45 KST
schedule. It remains temporarily paused until hosted validation passes. No
second automation was created. The production GitHub workflow now validates
only; its OpenRouter generation schedule and paid model-refresh schedule are
retired. Mac `main` has the release commit and its subscription CLI readiness
check passed.

The first hosted validation exposed a CI-only test configuration issue: global
`PIPELINE_OFFLINE=1` prevented mocked source/image fetch fixtures from running.
Only the full-test step now sets `PIPELINE_OFFLINE=0`; `LLM_PROVIDER=disabled`
remains enforced, no credentials are supplied, and the separate build/content
gates remain offline. The affected fixture tests passed 80/80, workflow tests
passed 5/5, and the exact CI-mode content gate passed locally. Independent
review approved the fix. The corrected hosted run and heartbeat resumption
remain pending at this snapshot.

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
The fresh trial of this complete path passed: ten new provider responses,
including the source brief, Fable drafting/repairs and three independent Astra
reviews. No cached responses were replayed. The final 1,932-word column has
five sections, source-summary ratio 0.255, overlap 0.015, zero unsupported
numeric claims and no repeated sentences. Independent native source review
also passed for its headline, deck, body and visible figures.

The accepted local column is `col_5be9ec4d110578c9`. Its public source records
were refreshed with the verified 7,621-character extraction while preserving
the existing news copy. Local artwork readiness passed before storage. The
full subscription runner completed successfully with 28 authorized feeds, zero
feed failures and three Astra-enriched archive-only items. It skipped a second
column under the existing four-hour gap. A concurrent runner was rejected by
the shared lock before generation. The unique native artwork is registered as
`codex/generated`; its source SHA-256 is
`02a46be2c55b598a52620119278b6ab4ce6c63a62518c16f68b237bc136d4ade`.
Hero and thumbnail crops were visually checked; hero, thumbnail and OpenGraph
files exist. This column has no remaining image job or blocked image entry.
The initial production publication is verified; corrected hosted validation
and resuming the existing heartbeat remain pending.

## Validation completed so far

- Source extraction and propagation: 71 focused tests passed.
- Authored column engine: 47 focused tests passed.
- Subscription routing: 41 focused tests passed.
- Subscription provider: 10 focused tests passed.
- Latest full runner: 805 source tests and 22 built-page tests passed, plus
  quality, relevance, taxonomy and repetition checks; 96 pages built.
- Independent code review approved the heading/source fixes, exact-block
  repairs, unchanged summary scoring, and bounded review retries.
- A live second runner was rejected by the held common-Git operation lock
  before generation. The outer lock remains owned across activation.

The full runner also passed its content gate and final audit tests. After
image registration, 12 image/readiness regression tests and the complete
content gate passed again. The rendered column has its five intended section
headings and unique hero. Source claims, repetition, public images and private
admin exclusion all passed. The successful heartbeat was recorded only after
these gates. Independent operational review found no code/config blocker;
corrected hosted validation and automation activation remain the final steps.
