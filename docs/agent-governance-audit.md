# Agent instruction governance audit — 2026-09-06

## Baseline and editing plan (recorded before policy edits)

- Production project: `ai-news-portal` (`prj_CkpRjLEoOEgwPfH2n6hOlxpeqFro`). Vercel latest successful production deployment: `dpl_AD2RuG7Rxhsa31gn8Afhdjfd72CV`, serving `computecurrent.com`; commit `d740f4ea5358656b5a1c655003484933f9993948`, package `0.0.18`.
- Worktree: `/Users/josh/Documents/compute-current-governance-audit`; branch `codex/agent-governance-audit-20260906`. The original checkout at `/Users/josh/Documents/New project 2` and its uncommitted production-baseline instruction remain preserved.
- Scope: repository instruction documents, skills, generation prompts, workflow/config wording and inherited instruction conflicts. No application business logic, runtime configuration, production, release, send, credentials, or financial actions may change. The user explicitly permits a minimal instruction-validation fix; the final-report validator exception is documented below.
- Inventory: [machine-readable pre-edit map](agent-governance-audit/instruction-map.before.json). It records 139 tracked candidates, exact matching passages, directory/workflow scope, precedence and nine behavior tags. Keyword hits are candidates, not defects. Source data, generated images, and historical evidence payloads are not agent policy.
- Review lanes: leader owns precedence, root policy, integration and verification; independent read-only agents examine workflow documents, editorial prompts/skills, and inherited user-level instructions.
- Sequence: audit and classify findings; retain all intentional gates; implement A (no authority expansion) and justified B (execution discretion within existing authority); keep C (new authority) proposals unimplemented; reread the complete diff; independently evaluate all ten user scenarios; run applicable existing tests and scan remaining phrases.
- Verification boundary: policy scenarios are static acceptance reviews, not live LLM behavior measurements. No instruction schema suite was found. Do not install missing dependencies to claim full coverage.

## Baseline verification

Before policy edits, ran Node 22.22.0 tests for release-workflow, docs-env-contract, commercial-policy-docs, operator-docs-truthfulness, current-docs-follow-truthfulness, qa-qc-workflow, source-extraction-fail-closed and source-fidelity-claim-check.

Result: 29 tests passed; two test files could not load because `sharp` is absent in this isolated worktree (`operator-docs-truthfulness` and `current-docs-follow-truthfulness`). These are environment limitations, not passing checks. No dependency installation or application change is warranted for a documentation-only cleanup. The QA/QC purge regression uses a loopback HTTP test server and a synthetic test token, not production.

## Prioritized issue table (pre-edit findings)

| Priority | File / exact existing instruction | Problem and behavior risk | Proposed edit | Safety impact | Authority |
| --- | --- | --- | --- | --- | --- |
| P1 | `.codex/skills/editorial-humanizer/SKILL.md`: “turn stiff AI-generated coverage into publishable editorial copy” | Rewrite quality can be confused with publication validation or dispatch authority. | Default to draft/review; require existing publication checks before publishable claims; reference root authority policy. | Preserve extraction, fidelity, repetition and send/publish boundaries. | A |
| P1 | `docs/content-cycle-runbook.md`: “After publishing or regenerating a batch, run:” followed by `npm run purge:cache` | Local regeneration can flow into an external mutation through a procedural instruction. | Apply existing separate authorization, credentials and rollback prerequisites to purge only; continue local preparation. | Clarifies existing QA/QC and user boundaries; no new permission. | A |
| P1 | `docs/automation-runbook.md`: “Do not run production-mutating commands without explicit production credentials and a rollback plan.” | Credentials may be mistaken for authority; one missing remote input may stop local work. | Credentials are not authorization; distinguish safe local work from protected mutations and required vs optional evidence. | Preserves existing protected-action gates. | A/B |
| P1 | `AGENTS.md`: existing editorial-only root policy (no clarification, approval reuse, agent lifecycle or evidence-limitation contract) | Relies on conflicting inherited workflow prose; premature stops and false completion remain possible. | Add one canonical repository policy for authorized continuation, narrowly scoped blockers, approval reuse, worker/validation/task-state separation, and evidence retention. | No new protected-action authority; stricter scoped gates remain effective. | A/B |
| P2 | `.codex/skills/editorial-humanizer/SKILL.md`: fixed numbered “Rewrite Pattern”; root: “Never reuse the same article structure for consecutive items.” | Rigid template conflicts with source-specific structure and creates needless rewrites. | Make sequence adaptable to source and article history; preserve required editorial questions. | Existing product-fit and fidelity requirements unchanged. | B |
| P2 | `.codex/skills/editorial-humanizer/SKILL.md`: literal “Remove template phrases such as …” list | Competing phrase inventory violates the root canonical-config rule. | Reference `config/bannedPhrases.yml` instead of duplicating phrases. | Canonical publishing guard unchanged. | A |
| P2 | `.codex/NEXT.md`: “## Current state”; “Next safe task”; “optionally commit refreshed data files” | Dated handoff looks like current evidence and a new work order. | Add historical-only scope and require current task/baseline evidence before reusing it. | Retain recorded evidence and all old task IDs. | A |
| P2 | `docs/qa-qc-runbook.md`: “blocked: local gates fail …”; “Push or deploy only after a separate explicit instruction.” | Release block can stop repair/report work; readiness can be mistaken for authorization. | Limit release verdict to affected artifact; continue repairs; retain separate explicit dispatch instruction and required validation. | No `blocked` or release gate weakening. | A/B |
| P2 | `prompts/autonomous-desk/final-copy-chief.md`: “Block publication if … the article lacks evidence, counterargument, watch metrics, or bottom line” | A required section may tempt fabricated objections; review output lacks explicit clean-review allowance. | Permit zero actual findings only if checks pass; prohibit invented facts/objections; retain every existing publication block. | Required evidence and BLOCK semantics unchanged. | A/B |

A = no authority expansion. B = increased execution discretion within existing authority. C = new authority, never implemented in this cleanup.

## Additional findings before the second edit pass

| Priority | File / exact instruction | Problem / proposed edit | Safety impact | Authority |
| --- | --- | --- | --- | --- |
| P1 | `scripts/lib/final-report-contract.mjs:33`: `none`/`n/a` bullet treated as empty in every section | `Remaining Risks: - None` is rejected despite a clean review. Add a regression first; permit an explicit zero-risk result only in that section. Preserve required sections, nonempty evidence, status words, minimum length and unfinished-report rejection. This is the user-authorized minimal instruction-validation exception, not application behavior. | No release/publication gate changes. | B |
| P1 | Three legacy plans: `wait for an explicit "okay" before declaring complete` | Removing it would remove an explicit human gate. Preserve wording, mark plans task-specific, and list a potential replacement only under policy approval. | Human approval retained. | C — NOT implemented |
| P1 | `final-copy-chief.md`: block if counterargument absent | Waiving this publication condition could weaken an explicit gate. Preserve it; allow evidence-backed empty review findings only when all required checks pass. | Publication BLOCK retained. | C waiver — NOT implemented |
| P2 | `scripts/lib/AGENTS.md:3`: follow both files | Same-directory override is the selected file; make fallback status clear and place root-policy reference in the override. | Editorial text retained unchanged. | A |
| P2 | `docs/production-verification-report.md:3` and `docs/qa-qc-report.md:3`: dated historical output without historical banner | Mark historical evidence, preserve old references and results; identify unavailable referenced artifacts. | No current health claim. | A |
| P2 | `plans/*.md`: historical task commands include dispatch and opportunistic installs | Add a scope banner: historical task specification, no standing action authority; preserve task-specific review/approval gates if explicitly resumed. Missing tools are an evidence limitation, not automatic installation authority. | Does not waive any required check. | A/B |

Application-level observations (not edited): fixed counterargument fallbacks in editorial code; editorial-cycle scan-error vs no-candidate presentation; duplicate phrase literals in generation code; production-smoke job emits diagnostic counts without asserting individual endpoint/marker success. A job status alone cannot establish that all probes passed. These need separate scoped code/runtime work, not an instruction cleanup.


## A. Executive summary

Implemented repository-local A/B improvements on the verified Vercel production baseline. The root policy now gives one authority-aware continuation rule, asks only essential questions after permitted retrieval, separates draft from dispatch, reuses valid approvals, classifies blockers, distinguishes worker execution from validated completion, and preserves audit records. Scoped documents reference this policy instead of inventing new gates.

The only executable change is the expressly permitted instruction-validation exception: a clean report can say `Remaining Risks: - None`. It does not waive evidence, required sections, skipped-check disclosure, review requirements, or publication gates. A failing regression was captured before the fix. No business logic, CI workflow, source-rights configuration, runtime policy, or production system was modified. No Category C change was implemented.

## Instruction precedence and coverage

1. Session system/developer instructions and the current user request govern before file guidance; the current request authorizes this audit and A/B cleanup, and expressly forbids external actions and Category C changes.
2. `/Users/josh/.codex/AGENTS.md` supplies user-level defaults. Repository-specific policy specializes defaults without waiving intentional protected-action gates. Its shared/global files were audited but not modified under a repository-scoped request.
3. Root `AGENTS.md` governs this repository. `scripts/lib/AGENTS.override.md` is selected instead of same-directory `AGENTS.md`; the root still applies. Its editorial requirements were preserved verbatim. The pointer `scripts/lib/AGENTS.md` remains useful to tools that read it directly, but is not a separately co-loaded Codex instruction file.
4. `.codex/skills/editorial-humanizer/SKILL.md` is conditional on applying that skill. Installed skills/role prompts are conditional too, not all active at once. Auditing their text did not invoke them. No `.agents/skills/` directory exists in this checkout; no additional tracked AGENTS/override files were found. No AGENTS file was found in the filesystem ancestors checked between `/` and `/Users/josh/Documents`.
5. Generation prompts apply when selected, and do not grant external-action authority. `prompts/` is outside the `scripts/lib/` directory scope. Runtime config and CI workflows are actual consumer contracts, not permission for an ad hoc agent to run scheduled actions.
6. Historical plans/reports remain evidence or task specifications. Reactivating one retains its explicit approvals/reviews; marking it historical does not erase those gates. No current task-store schema for general agent workers was found; editorial-cycle and pipeline states are application states, not worker lifecycle definitions.

Maps:
- [Readable repository map](agent-governance-audit/instruction-map.md): all 139 discovered candidates, scope/precedence, an exact line passage, and behavior tags. Two data/rollback candidates are explicitly excluded from instruction interpretation.
- [Exact pre-edit passages](agent-governance-audit/instruction-map.before.json): full keyword-indexed instruction passages and all nine governance categories.
- [Inherited map](agent-governance-audit/inherited-instruction-map.json): 11 shared global instruction/role/skill sources, exact lines, conditional scope, not edited.
- Substantive inspection covered root/nested instructions, the local skill, all generation prompt Markdown and four Korean-text prompt files, all seven plans, all seven workflows, active runbooks and deployment/auth/monetization gates, and relevant configuration. All tracked document candidates were phrase-scanned; historical reports were not treated as current proof. Read-only code inspection traced prompt, report-validation, publication and pipeline-state consumers. Unrelated installed plugins were not exhaustively audited because they are not selected for this repository task.

## B. Files changed and authority classification

| File | Previous problem → exact change | Expected behavior | Class |
| --- | --- | --- | --- |
| `AGENTS.md` | Editorial-only contract → added Instruction Scope, Production Baseline, Authorized Execution and Clarification, Approval and External Actions, Blockers and Evidence, Task Lifecycle and Verification sections. Original Product Definition onward unchanged. | Finish authorized local work; ask only essential questions; preserve dispatch gates; no false completion. | A/B |
| `scripts/lib/AGENTS.md` | Implied co-loading of both directory files → explicitly a fallback pointer. | Avoid precedence ambiguity without another gate. | A |
| `scripts/lib/AGENTS.override.md` | Root inheritance implicit → explicit selected-file/root-policy reference; all editorial criteria unchanged. | Local scope remains strict and consistent. | A |
| `.codex/skills/editorial-humanizer/SKILL.md` | Promised publishable copy, rigid sequence, duplicated phrase list → draft scope, explicit QA prerequisite, adaptable source-specific order, canonical phrase-config reference and evidence preservation. | Complete rewrites without dispatch or repetition pressure. | A/B |
| `.codex/NEXT.md` | Undated “Current state”/next-task handoff → historical-only banner retaining all recorded content. | Fresh evidence and current user request determine work. | A |
| `docs/automation-runbook.md` | Credentials could be read as authority → exact action/target authorization plus existing credentials/rollback; optional failures limited to independent work. | No regeneration-to-production authority jump or whole-task stop from optional input. | A/B |
| `docs/content-cycle-runbook.md` | Unconditional purge after regeneration → prepare follow-up; execute only within separate authorized purge scope and prerequisites. | Local work finishes without unrequested purge. | A |
| `docs/qa-qc-runbook.md` | Readiness vs execution/completion unclear → verdict scope, repair continuation, skipped-check and approval-reuse clarification. | Repair release blockers while retaining release/dispatch gates. | A/B |
| `docs/production-verification-report.md` | Old live results looked current → historical banner and unavailable old-artifact note. | No current health claim from 0.0.1 evidence. | A |
| `docs/qa-qc-report.md` | Dated deployable verdict could be reused → historical banner and fresh-evidence requirement. | Preserve old failures/skips without claiming current readiness. | A |
| `plans/article-graphics-image2-origin-plan.md` | Task commands looked standing → historical task-scope banner, retained body. | No automatic re-execution/installation/dispatch; existing gates retained. | A/B |
| `plans/compute-current-omo-ultra-rebuild.md` | Same → same banner; mandatory reviews and conditional human approval unchanged. | Same. | A/B |
| `plans/compute-current-public-article-images.md` | Same → same banner; push examples unchanged as historical specification. | Same. | A/B |
| `plans/computecurrent-missing-images-vercel.md` | Same → same banner; explicit “okay” remains. | Same. | A/B |
| `plans/homepage-premium-redesign.md` | Same → same banner; reviewer requirements remain. | Same. | A/B |
| `plans/recovery-point-1-merge-deploy.md` | Same → same banner; tag conflict/destructive and explicit “okay” gates remain. | Same. | A/B |
| `plans/review-cleanup-ulw-loop.md` | Same → same banner; explicit “okay” remains. | Same. | A/B |
| `prompts/autonomous-desk/final-copy-chief.md` | Review could imply dispatch or manufactured objections → review-only output, supported findings including zero, no fabrication; entire original BLOCK list retained. | Honest clean reviews without weakened publication checks. | A/B |
| `scripts/lib/final-report-contract.mjs` | Rejected zero-risk bullet → exact `none` allowance only for `remaining_risks`. | Clean report need not invent a risk. This validates a report, not truth or release readiness. | B |
| `tests/final-report-contract.test.mjs` | No zero-risk regression → positive clean report plus negative required-evidence/cleanup/empty-risk cases. | Lock the narrow validator exception. | B validation |
| `docs/agent-governance-audit.md` | No integrated audit → plan, findings, per-file classifications, preserved gates and validation evidence. | Reviewable decisions and explicit limits. | A |
| `docs/agent-governance-audit/*` | No reproducible audit packet → inventory maps, RED/GREEN and targeted test outputs, static safety checks, review receipts and phrase scan. | Preserve machine/audit evidence separately from human report. | A |

B changes expressly increase execution discretion: choosing non-material defaults; finishing independent work after optional failures; adaptable rewrite structure; accepting zero real review findings/risks. They add no send, publish, deploy, secret, financial, destructive or security-boundary authority.

## C. Remaining policy conflicts and evidence limits

### Shared global surfaces: audited, not edited

These are repository-external defaults or conditional workflows; changes would affect other projects. Repository guidance handles the present direct-execution case but cannot claim to repair the installed runtime.

| Priority | Exact source / instruction | Conflict and proposed repair | Class if separately scoped |
| --- | --- | --- | --- |
| P1 | `~/.codex/AGENTS.md:203`: cleanup “still follows” interview → consensus → team/Ralph; `:58-65` permits solo execution | Forced interviews/runtime conflict with scoped direct work. Make routing conditional on ambiguity and coordination while retaining selected workflow gates. | B |
| P1 | `~/.codex/skills/ralph/SKILL.md:132-142`: success `complete` then cancel; `cancel/SKILL.md:45-55`: `cancelled` | Successful completion can be conflated with cancellation. Preserve canonical completion/audit state during cleanup. Runtime behavior not exercised here. | A |
| P1 | `~/.codex/AGENTS.md:222-224`: “Execute omx setup” | Setup instruction may induce unrelated installs. Limit to explicitly requested installation/diagnosis; no setup was run. | A |
| P1 | `~/.codex/agents/verifier.toml:22-36`: unavailable proof source stops verification | Distinguish optional proof from essential missing evidence; continue independent checks and report PARTIAL where appropriate. | B |
| P1 | `~/.codex/skills/code-review/SKILL.md:267-271`: unavailable review → `REQUEST CHANGES` | Missing review is not proof of a defect. Report incomplete/unavailable review while keeping merge readiness blocked. | A |
| P2 | `~/.codex/agents/code-reviewer.toml:61-65`: “Never approve without running lsp_diagnostics” | No inapplicable/unavailable branch. Mark missing material diagnostics as evidence limitation without inventing a pass; use applicable existing checks for non-code files. | A; preserve explicit selected review gates |
| P2 | `~/.codex/skills/code-review/SKILL.md:118-135`: “Strongest counterargument against approving as-is” | Template can pressure invented objections. Permit none when supported; preserve independent review and BLOCK. | B |
| P2 | `~/.codex/agents/executor.toml:13-15`: investigation treated as implementation; `:68-70`: stop after three approaches | Diagnose-only scope is not repair authority; a retry count is not proof of no safe recovery. Separate investigation scope and reassess available alternatives. | A/B |

### Repository constraints intentionally remaining

- Explicit human approval in selected historical plans remains mandatory (section D). It is an exception to ordinary approval reuse, not a reason to prompt during unrelated tasks.
- Missing counterargument still blocks publication under the final-copy-chief and related editorial contracts. The agent must not invent one; it may complete independent work while the affected publication remains blocked.
- Runtime editorial code still contains generic fallback counterarguments and duplicate banned-phrase strings; story-archetype prompt examples also contain duplicate strings. Synchronizing those consumers is not part of this limited governance patch. No application-generation behavior is claimed fixed.
- `editorial-cycle.mjs` and its status presentation can blur scan errors and no qualifying signals; no general worker task-store schema exists here. This audit defines agent reporting semantics without migrating pipeline states.
- `Prod Smoke` prints endpoint/marker evidence without asserting every required probe. Its final pipeline may fail for some errors, so “always succeeds on total failure” is not a proven claim. A green job alone does not prove every printed probe passed. Workflow code was left unchanged; inspect actual evidence or use an authorized, properly asserting verifier.
- Two pre-edit document-test files cannot load without `sharp`. The 34 runnable targeted tests pass; the two unavailable suites are not represented as passed. No installation, build, full application typecheck, or live behavioral execution was performed. This is a bounded evidence limitation for an instruction-only change plus report-validator exception.

## D. Requires Explicit Policy Approval — NOT implemented

| Current rule | Potential proposed rule | Exact authority expansion and risk | Recommendation |
| --- | --- | --- | --- |
| `plans/review-cleanup-ulw-loop.md:363`, `plans/computecurrent-missing-images-vercel.md:409`, `plans/recovery-point-1-merge-deploy.md:532`: all reviewers approve, then wait for explicit human “okay” before declaring complete | After required reviews, finish local deliverables without this final human approval; gate only separately protected external release actions | **C:** removes an explicit human completion gate from those selected workflows. Could bypass an intentional release/completion control. | Leave unchanged unless the user authorizes this exact policy change. No current approval is requested because these legacy workflows were not selected for this cleanup. |
| `prompts/autonomous-desk/final-copy-chief.md:13`: missing counterargument blocks publication, reinforced by related prompt/config requirements | Require a counterargument only when evidence supports a material opposing claim | **C (conservative classification):** allows publication previously blocked by an explicit editorial condition. Could weaken intentional quality/copyright transformation requirements. | Preserve the block and factual integrity; changing it needs exact policy approval and aligned tests/config changes. |

No proposal to loosen external-send, deployment, credentials, force push, financial/contract, or incident-freeze controls was implemented or recommended.

## E. Behavioral acceptance results

Two independent read-only reviewers found zero evidence-backed blocking issues in the final policy diff. These are **static instruction evaluations**, not empirical multi-run LLM behavior tests. Runtime behavior for all ten scenarios is **NOT RUN**.

| # | Scenario | Static result | Evidence / expected action |
| --- | --- | --- | --- |
| 1 | Rewrite an email | PASS | `AGENTS.md` Draft/review mode: finish draft, no send or unnecessary confirmation. |
| 2 | Meeting date missing | PASS | Clarification criterion: non-material date remains unknown; summarize with available evidence. |
| 3 | Optional source fails | PASS | Optional input/fallback classification: continue remaining research and disclose limitation. |
| 4 | Binding proposal lacks price | PASS | No inferred financial/binding terms; prepare independent sections, ask only missing essential decision. |
| 5 | Draft vs send email | PASS | Explicit dispatch request plus applicable approval required; drafting grants no send authority. |
| 6 | Worker lifecycle | PASS | `started` → optional `partial` → `done` → validation → persistent `completed`; no parent/child circular wait. |
| 7 | Verifier finds no issue | PASS | `top_issues: []` allowed if all required checks pass; no invented counterargument, no weakened BLOCK. |
| 8 | No live access | PASS | Report checked/unchecked/unknown/materiality; no fake health claim or opportunistic install/restart/config mutation. |
| 9 | Production mutation | PASS | Exact action/target authority and existing gates remain; preparation can continue. |
| 10 | Existing valid approval | PASS | Reuse within scope/validity; renew for changed artifact/parameters or explicit governing renewal requirement. |

Verification performed:

- Baseline report-contract tests: **3/3 PASS** ([log](agent-governance-audit/report-contract-baseline.tap)).
- Added regression before validator edit: **4 PASS / 1 expected FAIL**, demonstrating the zero-risk rejection ([RED log](agent-governance-audit/report-contract-red.tap)).
- Fixed report-contract tests: **5/5 PASS** ([GREEN log](agent-governance-audit/report-contract-green.tap)); independently rerun by reviewer with the same 5/5 result.
- Final targeted suite: **34/34 PASS** ([log](agent-governance-audit/targeted-tests.tap)); includes release-workflow, docs-env-contract, commercial-policy-docs, qa-qc-workflow, extraction, source fidelity, final-report-contract.
- `node --check` on both modified JavaScript files: **PASS**.
- `git diff --check`, introduced Markdown links and static preservation/scope checks: **PASS** ([receipt](agent-governance-audit/safety-and-scope-checks.json)).
- Combined-file review and remaining high-risk phrase scan: performed; retained gates, historical specifications and application limitations classified rather than mechanically deleted.
- Full application lint/typecheck/build: **NOT RUN**, no such claim; no application behavior changed and missing dependencies were not installed. No dedicated instruction-schema or live agent behavior harness was found. The report validator and policy scenarios provide narrower evidence.

## F. Safety preservation check

| Control | Result | Basis |
| --- | --- | --- |
| External-send approval | INTACT | Explicit request plus applicable approval, no drafting-to-dispatch inference. No messages sent externally. |
| Publish approval | INTACT | Authority separated from editorial readiness; original publication BLOCK list unchanged. |
| Production/deploy gate | INTACT | Separate explicit instruction, same target/scope, applicable human approval, production credentials and rollback requirements retained. No push/deploy/purge performed. |
| Destructive-operation gate | INTACT | Destructive/force-push and remote-tag conflict controls unchanged. No destructive Git/infra operation. |
| Secret/credential restrictions | INTACT | Credentials are not authority; no secrets accessed or new credentials configured. Existing test uses synthetic local values only. |
| Contract/financial authorization | INTACT | No inferred terms, recipient, signing or investment authority. No financial action. |
| Critical verifier/BLOCK/incident semantics | INTACT | Required reviews and all explicit legacy approvals remain; zero findings never overrides an unresolved BLOCK or freeze. |
| Factual/source-fidelity controls | INTACT | Original root editorial text and scoped criteria preserved verbatim; extraction/source-fidelity regression tests pass. Source-rights/copyright/config unchanged. |
| Legal/commercial confidentiality | INTACT | Existing rights attestations and commercial activation gates unchanged; canonical evidence retention remains subject to secret redaction/confidentiality. |

## G. Diff summary and handoff

20 existing files changed, plus this audit and its evidence packet. Most edits add scoped guidance or historical banners. The two-line validator adjustment is the only executable implementation change, covered by regression tests; its test file is the only test edit.

All changes are local to the production-based worktree and remain uncommitted. The original checkout's local production-baseline edit is preserved. No merge, push, release, deployment, external communication, production mutation, secret retrieval, installation, signing or financial transaction was performed. Open the worktree for subsequent code work to use this reviewed policy; the old checkout is not silently synchronized or presented as updated.

The evidence packet was moved from the ignored `evidence/` tree into `docs/agent-governance-audit/` so a future reviewed commit can retain it with the policy patch. Historical evidence and original test outputs remain unchanged.


## Authorized deployment follow-up — 2026-09-06

After the audit, the user explicitly requested commit, push and production deployment. This supersedes the audit-only external-action restriction for this scoped release; it does not authorize unrelated production changes.

- Rechecked Vercel production: `dpl_3btcDnmJUh6Eoen1mKzL4Md3WmGt`, commit `9e0db38ae9e58c7a4dd9a85e3cee9e8c7aa44263`, package `0.0.18`. Fast-forwarded the worktree to that commit while preserving the reviewed patch. This deployment is the pre-release rollback reference.
- Installed the existing lockfile dependencies with `npm ci --no-audit --no-fund` for deployment validation; no dependency version or lockfile changed. The earlier missing-`sharp` limitation no longer applies to this follow-up.
- `npm run check`: 0 errors, 0 warnings, 18 hints.
- Initial `npm test` source phase: 533 passed, 1 failed because the existing taxonomy report had stale counts (12 archive partitions instead of 20). Corrected only `docs/taxonomy-pages-report.md` from checked-in canonical data and existing eligibility functions: 470 source records, 18 eligible archive records, 5 populated taxonomy routes. No article data, generation logic, rights gate or configuration changed. Authority class A: evidence accuracy.
- Reran `tests/taxonomy-current-feed.test.mjs`: all 3 passed. The other 533 source tests had already passed; the expensive source suite was not needlessly rerun in full after this report-only repair.
- Completed the remaining `npm test` stages separately: production build (74 pages), built-output tests (22/22), quality gate, relevance, taxonomy and repetition checks all passed.
- Ran a credential-pattern scan of the audit packet. Its only match was the `sk-` fragment in a public Samsung/SK Hynix article URL, not a credential. No real credential material was found.
- Push uses the existing GitHub main/Vercel integration and its automatic semantic-release workflow. No manual version bump, duplicate manual deploy, cache purge or unrelated runtime mutation is part of this release. The final commit/deployment identifiers and live checks are recorded in the task after remote execution.

See `deployment-preflight.json` in the audit packet for the machine-readable preflight. Earlier audit-only “not performed” statements describe the preceding audit phase, not this subsequently authorized deployment.
