# Compute Current Article Generation Eval Baseline

Generated: 2026-05-17T07:40:32.484Z

Evaluated 50 historical articles from `src/data/latest-news.json` and `src/data/archived-news.json`. The available corpus contains 359 deduped records; this run uses the newest 50.

## Summary

- Overall average score: 0.43
- Articles passing every eval: 0/50 (0%)
- Minimum requested sample size: 50

## Eval Results

| Eval | Avg Score | Pass Rate | Failures |
| --- | ---: | ---: | ---: |
| source fidelity | 0.51 | 50% | 25 |
| extraction quality | 0.65 | 52% | 24 |
| infrastructure relevance | 0.82 | 94% | 3 |
| insight specificity | 0.75 | 0% | 50 |
| repetition | 0.01 | 2% | 49 |
| taxonomy accuracy | 0.23 | 0% | 50 |
| seo helpfulness | 0.94 | 100% | 0 |
| article blueprint diversity | 0.35 | 0% | 50 |
| generic language penalty | 0.01 | 0% | 50 |
| publish decision accuracy | 0.00 | 0% | 50 |

## Lowest Scoring Articles

| Score | Source | Title | Failed Evals |
| ---: | --- | --- | --- |
| 0.29 | Bloomberg Technology | Akamai’s $1.8B AI Power Move | source_fidelity, extraction_quality, infrastructure_relevance, insight_specificity, repetition, taxonomy_accuracy, article_blueprint_diversity, generic_language_penalty, publish_decision_accuracy |
| 0.31 | Bloomberg Technology | Tech Stocks Power Wall Street Gains \| The Close 5/14/2026 | source_fidelity, extraction_quality, infrastructure_relevance, insight_specificity, repetition, taxonomy_accuracy, article_blueprint_diversity, generic_language_penalty, publish_decision_accuracy |
| 0.32 | Toms Hardware | Maryland citizens slapped with $2 billion power grid upgrade bill for out-of-state AI data centers — state complains to federal energy regulators, says additional cost breaks ‘ratepayer protection pledge’ promises | source_fidelity, extraction_quality, insight_specificity, repetition, taxonomy_accuracy, article_blueprint_diversity, generic_language_penalty, publish_decision_accuracy |
| 0.32 | Bloomberg Technology | Malaysia Mulls Steps Against Meta on Fake Royal Accounts: Report | source_fidelity, extraction_quality, infrastructure_relevance, insight_specificity, repetition, taxonomy_accuracy, article_blueprint_diversity, generic_language_penalty, publish_decision_accuracy |
| 0.32 | Data Center Dynamics | Sponsored: Can you engineer around human friction? Why ‘social interconnection’ is the new site selection priority | source_fidelity, extraction_quality, insight_specificity, repetition, taxonomy_accuracy, article_blueprint_diversity, generic_language_penalty, publish_decision_accuracy |
| 0.33 | Bloomberg Technology | ECB’s Escrivá Says AI Risks Prompt Finance Infrastructure Review | source_fidelity, extraction_quality, insight_specificity, repetition, taxonomy_accuracy, article_blueprint_diversity, generic_language_penalty, publish_decision_accuracy |
| 0.34 | Bloomberg Technology | A $400 AI Bet That’s Actually a High-Stakes Wager on the Future of Work | source_fidelity, extraction_quality, insight_specificity, repetition, taxonomy_accuracy, article_blueprint_diversity, generic_language_penalty, publish_decision_accuracy |
| 0.34 | Data Center Dynamics | Sponsored: In-rack CDU v. floor-mounted CDU: Which option is better for your data center? | source_fidelity, extraction_quality, insight_specificity, repetition, taxonomy_accuracy, article_blueprint_diversity, generic_language_penalty, publish_decision_accuracy |
| 0.35 | Bloomberg Technology | Anthropic Expands Push Into Legal Industry With New AI Tools | source_fidelity, extraction_quality, insight_specificity, repetition, taxonomy_accuracy, article_blueprint_diversity, generic_language_penalty, publish_decision_accuracy |
| 0.35 | Bloomberg Technology | China Data Centers Tap Spot Power Trading First Time: Report | source_fidelity, extraction_quality, insight_specificity, repetition, taxonomy_accuracy, article_blueprint_diversity, generic_language_penalty, publish_decision_accuracy |

## Strongest Articles

| Score | Source | Title |
| ---: | --- | --- |
| 0.50 | StorageReview | Anthropic Signs SpaceX Colossus 1 Deal For Major Claude Compute Expansion |
| 0.50 | Data Center Frontier | AI Data Centers Are Driving Nuclear's Next Commercial Test |
| 0.50 | ServeTheHome | Striking Back at AI Memory Pricing… Using AI |
| 0.50 | TechCrunch AI | Notion just turned its workspace into a hub for AI agents |
| 0.50 | Semiconductor Engineering | Lasers Are The Heartbeat Of The Optical AI Data Center |

## Method

1. Source fidelity: lexical overlap between generated article fields and source text, with a penalty for generated numbers not present in source text.
2. Extraction quality: persisted extraction QA when available, otherwise a deterministic extraction-quality recomputation over stored article text/snippet.
3. Infrastructure relevance: persisted classifier score when available, otherwise deterministic relevance classification.
4. Insight specificity: expert insight field coverage plus whether generated body uses extracted insight fields.
5. Repetition: existing repetition detector against prior historical articles in chronological order.
6. Taxonomy accuracy: stored taxonomy compared with deterministic taxonomy classification.
7. SEO helpfulness: headline/meta length, infrastructure terms, and body depth checks.
8. Article blueprint diversity: selected blueprint presence, rolling run length, and recent blueprint variety.
9. Generic language penalty: banned phrase and generic scaffold detection.
10. Publish/no-publish decision accuracy: current policy oracle compared with stored publish state.

## Baseline Notes

- Several historical records predate extraction QA, expert insight fields, and article blueprint persistence; those gaps are intentionally visible in this baseline.
- This is a deterministic local eval suite, not a model-graded eval. It is designed for regression tracking and gate calibration before publishing.
- The publish-decision eval uses the current policy as the oracle: relevance >= 0.75, extraction quality >= 0.8, complete insight specificity, repetition pass, and generic-language pass.
