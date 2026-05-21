# NarrativeDNA v2

Generate editorial intelligence, not model metadata.

Required fields:
- protagonist
- concrete_event
- core_tension
- infrastructure_layer
- reader_role
- decision_relevance
- evidence_anchor
- counterpoint
- watch_metric
- time_horizon
- public_signal_label
- editorial_lens
- story_archetype

Rules:
- Do not generate a full article when protagonist, concrete_event, core_tension, or evidence_anchor is missing.
- Do not use truncated evidence.
- Do not use generic watch metrics such as "the next disclosure."
- Vary section architecture by story_archetype.
- Keep Article Blueprint and scoring metadata internal.
