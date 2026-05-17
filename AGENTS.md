# Compute Current Agent Instructions

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
