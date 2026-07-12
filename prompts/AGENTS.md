# Prompt Corpus Instructions

## OVERVIEW

`prompts/` contains prompt and story-archetype text used by the canonical editorial registry plus legacy compatibility flows.

## STRUCTURE

```text
prompts/
|-- autonomous-desk/  # analysis, thesis, evidence, style, and copy-chief prompts
|-- blog-engine-v4/   # blog drafting, routing, rewrite, tone, and research prompts
`-- story-archetypes/ # reusable article/story shape definitions
```

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| Autonomous desk thesis/evidence | `prompts/autonomous-desk` | Must preserve infrastructure decision-support framing. |
| Blog engine voice/structure | `prompts/blog-engine-v4` | Pair changes with blog-engine and repetition tests. |
| Story shape inventory | `prompts/story-archetypes` | Avoid consecutive structural reuse. |
| Narrative voice baseline | `prompts/narrative-dna-v2.md` | Keep style specific, not template-like. |

## CONVENTIONS

- Prompt edits are product behavior changes; update or run related tests.
- Confirm that a prompt is registered in the active canonical flow before treating it as production behavior.
- Use source-specific constraints and concrete infrastructure nouns.
- Keep instructions aligned with extraction QA, source fidelity, repetition, and product-fit gates.
- Vary structure, opening move, paragraph rhythm, and analytical angle across generated items.

## ANTI-PATTERNS

- Do not add fallback paragraphs reusable across many articles.
- Do not include canonical banned phrase inventories in prompt text.
- Do not ask models to infer infrastructure impact when the source does not support it.
- Do not preserve generic "AI demand" framing unless the source directly supports the infrastructure decision point.
