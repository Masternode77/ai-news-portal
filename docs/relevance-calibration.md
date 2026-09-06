# Relevance calibration: Korean infrastructure signals

## Decision

The production thresholds remain unchanged: `0.75` for a full memo and `0.55` for a signal card. The calibration fixes language coverage rather than lowering the editorial bar.

Korean text previously disappeared during ASCII-only normalization. The classifier now maps a narrow set of physical infrastructure terms into its existing dimensions: data centers, grid connection, substations, transmission, power supply and load, cooling, chillers, immersion and liquid cooling, rack capacity, permitting, and siting. The strict router recognizes the same physical layers.

Broad Korean AI language does not create an infrastructure match. Consumer chatbot/app terms remain below the signal-card threshold. Semiconductor stock-price language such as `관련주`, `수혜주`, `주가`, and `급등` is capped below the public threshold when the source has no physical infrastructure evidence, and the strict router archives it. The same words do not block a source that names concrete grid, transmission, substation, power, cooling, or data-center work; for example, a transmission-cost increase remains an infrastructure signal.

## Calibration set

The test set contains four direct infrastructure controls and four negatives:

- Korean AI data-center grid-code and connection work
- Korean multi-gigawatt supply, substation, and transmission plans
- Korean chiller and immersion-cooling deployment support
- An existing-style English utility interconnection control
- Korean consumer chatbot/photo-app news
- Korean AI-semiconductor stock chatter
- Korean general AI ethics and education policy
- An existing-style English consumer AI control

At the unchanged `0.55` public-signal floor, the fixture set produces 4 true positives, 4 true negatives, no false positives, and no false negatives: precision `1.00`, recall `1.00`. This is a small boundary regression set, not a population-level estimate. Extraction QA, source fidelity, repetition checks, and publish-readiness gates are unchanged.
