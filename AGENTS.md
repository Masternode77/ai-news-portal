# Compute Current Agent Instructions

## Instruction Scope

Follow system/developer instructions and the current user request before repository guidance. This file is the canonical repository policy for agent execution. More specific directory instructions retain their intentional safety and editorial requirements. At a given directory, Codex selects `AGENTS.override.md` instead of `AGENTS.md` when both exist; ancestor instructions still apply. Skills and task documents apply only to their selected work and cannot grant authority beyond the governing request and policy.

Plans, report templates, historical reports, and `.codex/NEXT.md` are not new work orders, current verification evidence, or permission to dispatch external actions. A report template does not create an approval requirement. An explicitly required human release approval or independent review remains required.

## Production Baseline

- Use the current successful Vercel production deployment serving `computecurrent.com` as the baseline for future work and version checks; previews are separate.
- Before code changes, verify its Git commit and compare it with the local checkout. Fetch and prepare a branch or worktree based on that commit when needed, preserving existing local work and prior authorized task changes.
- Recheck for each new task; a previously observed version or local package version is not proof of current production. If live access is unavailable, continue independent preparation from a clearly identified known commit, disclose the limitation, and do not claim production alignment or deploy.

## Authorized Execution and Clarification

When the objective is clear, finish all safe, reversible, in-scope work already authorized by the user: retrieve evidence, prepare artifacts, make permitted local edits, and verify them. Do not ask whether to continue at an intermediate step. A scoped cleanup can use a written plan, applicable regression checks, edits, and independent review without initiating an interview or unavailable orchestration runtime. Explicitly selected workflows retain their required reviews and approval gates.

Ask only when a missing fact or decision cannot be resolved through permitted retrieval or a clearly labeled non-material assumption and would change the deliverable's correctness, authorization, recipient, target environment, binding terms, safety, or reversibility. Choose reasonable presentation defaults. Prepare independent portions while awaiting an essential answer.

Do not infer recipients, contractual commitments, financial terms, legal conclusions, production targets, destructive intent, secret values, credential access, or permission to send/publish/deploy. Existing verified targets may be reused only within the authorized scope.

## Approval and External Actions

- Draft/review mode creates or improves the requested local artifact only. Drafting, reviewing, designing, or improving does not authorize sending, posting, publishing, deploying, notifying others, or mutating external systems.
- Execution/dispatch mode requires an explicit request for the external action and satisfaction of all applicable authorization and validation rules. Preserve separately required human release approval, production/deploy and mutation gates, destructive/force-push controls, secret-access restrictions, contract/financial/investment authorization, confidentiality, security boundaries, and incident freezes. A prohibition stays prohibited unless its governing policy explicitly permits an exception.
- Credentials, a passing test, a `deployable` verdict, an example command, or an existing scheduled workflow are not permission for an ad hoc external action. Do not change active agent policy/config beyond the specifically authorized policy-edit scope.
- Approval covers only the specified action, artifact/change, target system, recipient, environment, scope, and material parameters. Do not ask for the same still-valid approval again unless that scope or artifact materially changes, approval expires, or a governing rule requires renewal. Approval to draft is not approval to send; staging approval is not production approval.
- When a protected step lacks authority, continue permitted research, drafting, local preparation, validation, and rollback planning. Make the concrete artifact and target reviewable before seeking approval for that step. This does not authorize accessing secrets, provisioning tools, or performing the protected action as preparation.

## Blockers and Evidence

Classify failures by what they prevent:

- **Hard blocker:** missing essential fact/authority, required gate failure, verifier `BLOCK`, or safety boundary prevents an affected deliverable or action. Do not perform that action or mark its deliverable complete. Continue safe repair and independent work.
- **Soft blocker:** a recoverable problem with a permitted alternative. Try the alternative and verify the result without weakening acceptance criteria.
- **Optional missing input:** not required by the request or governing acceptance criteria. Continue using an existing permitted fallback or omit it with a disclosed limitation.
- **Evidence limitation:** a check could not run. Identify checks performed/not performed, remaining unknowns, and whether the gap prevents the conclusion. Missing evidence is not a passed check or proof of a defect.

Stop the whole task only when no safe, authorized next step can advance the requested result. Do not silently relabel required sources or tests as optional, weaken extraction/publication gates, wait indefinitely, or claim full completion from partial output. Lack of live access does not authorize installs, privilege escalation, secret access, service restarts, or configuration changes. No fabricated health metrics, rankings, facts, or test results.

## Task Lifecycle and Verification

Separate execution events from validation and persistent task state:

- `started`: assigned execution began.
- `partial`: useful intermediate output; required work remains.
- `done`: a worker finished its assigned execution and supplied artifacts/limitations.
- `blocked`: a worker cannot safely finish its assigned execution; identify the dependency and recoverable independent work.
- `completed`: the owning orchestrator has checked all required deliverables and validation criteria. Worker `done` alone never establishes this state.

Workers may report `started`, optional `partial`, then `done` or `blocked`; they do not wait for parent completion to finish their own assignment. The parent validates completed execution and keeps unresolved required work open. An optional child failure does not block unrelated work or a deliverable whose explicit fallback criteria are satisfied. Required review lanes remain required.

These meanings guide reporting, not a new runtime schema: use the active tool's supported states and transitions. Do not manually rewrite hook-owned state, map success to cancellation, or erase canonical evidence during cleanup. For native goal tools, follow their explicit completion and blocked-state rules.

Run the smallest relevant available checks that prove the change, plus any explicitly required gates. For documentation-only edits, reread the combined policy, check links/diff, and run applicable existing instruction/document tests; application lint/typecheck/build are not proof of agent behavior. Record missing required validation and keep the affected readiness claim unresolved.

Reviews contain 0–N evidence-backed findings; a clean review may return `top_issues: []`. Do not invent defects, uncertainty, counterarguments, or facts to satisfy a count. Missing required independent review is an incomplete review, not a clean pass or fabricated code defect. Preserve verifier `BLOCK` and unresolved high-severity findings until the required revalidation clears them.

Keep human-facing copy readable without exposing inappropriate internal details. Retain canonical evidence references, task IDs, review packets, JSON/YAML state, and audit records; copy sanitization is not permission to delete or falsify them. Existing confidentiality and secret-redaction restrictions still apply.

## Product Definition

Compute Current is not a generic AI blog. It is an AI infrastructure intelligence product for operators, investors, cloud capacity teams, data center developers, and infrastructure strategists.

Agents working in this repository must preserve that product boundary. Treat every generated or edited article as decision-support material for infrastructure readers, not as broad AI news commentary.

## Editorial Rules

- Never generate a long-form article from a source that fails extraction QA.
- Never reuse the same article structure for consecutive items.
- Every article must have a specific thesis tied to the source.
- Do not force weakly related AI news into data center infrastructure framing.
- Every article must answer:
  1. What changed?
  2. Why does it matter for AI infrastructure?
  3. Who benefits?
  4. Who is exposed?
  5. What bottleneck or decision point should readers watch?
- Ban generic repeated phrases unless justified by the source.
- Always run repetition and source-fidelity evals before publishing.

## Banned Generic Patterns

Do not generate or preserve generic patterns in reader-facing article copy. The canonical phrase inventory lives in `config/bannedPhrases.yml`; update that config and the publishing guard together instead of copying blocked strings into prompts, fallback copy, or article data.

## Content Generation Scope

For content generation, curation, extraction, editorial prompts, article QA, and archive/search article shaping under `scripts/lib/`, also follow `scripts/lib/AGENTS.override.md`.

If changing prompts, fallback editorial copy, quality gates, source extraction, article enrichment, category/tag logic, or publish readiness checks, treat these editorial standards as acceptance criteria. Do not weaken extraction QA, repetition checks, source-fidelity checks, or product-fit boundaries without an explicit user request.
