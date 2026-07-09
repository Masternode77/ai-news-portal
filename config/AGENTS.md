# Config Policy Instructions

## OVERVIEW

`config/` holds editorial policy registries, routing rules, phrase inventories, source priorities, and publishing constraints consumed by scripts and tests.

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| Banned repeated language | `config/bannedPhrases.yml` | Canonical phrase inventory. |
| Public phrase safety | `config/forbiddenPublicPhrases.yml`, `config/forbiddenAIPhrases.yml` | Public copy must avoid internal/template language. |
| Editorial routing | `config/editorialArchetypesV2.yml`, `config/relevance-routing-rules.yml` | Keep weakly related AI news out of infra framing. |
| Blog policy | `config/blogArchetypes.yml`, `config/blogLengthPolicy.yml`, `config/blogToneLibrary.yml` | Pair with blog-engine tests. |
| Source policy | `config/sourceRegistry.yml`, `config/sourcePriority.yml`, `config/signalScoringPolicy.yml` | Drives source discovery and ranking. |
| Publishing policy | `config/publishingRoutePolicy.yml`, `config/copyrightSafeTransformationPolicy.yml` | Public route and transformation gates. |

## CONVENTIONS

- Treat config as executable policy. Update the consuming guard/router and tests in the same change.
- Prefer concrete source/domain nouns over reusable generic framing.
- Keep YAML keys stable unless migration code and tests are included.
- When changing policy thresholds, state which public or editorial behavior changes.

## ANTI-PATTERNS

- Do not duplicate banned phrase lists in prompts, fallback copy, fixtures, or scripts.
- Do not relax quality gates by changing config alone.
- Do not add broad AI-news categories that bypass the infrastructure product boundary.
- Do not let source registry changes create unsupported article claims.
