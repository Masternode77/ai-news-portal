# Compute Current Content Generation Override

This override applies to content generation modules in `scripts/lib/`.

## Editorial Acceptance Criteria

- Extraction QA is a publish gate. A source that fails extraction QA may remain a signal item that links to the source, but it must not receive a generated long-form local article.
- Every generated article must carry a source-specific thesis. Avoid broad AI market framing unless the source is directly about infrastructure capacity, power, chips, cloud deployment, data centers, cooling, financing, or policy constraints.
- Do not make AI infrastructure claims that are not supported by the extracted article text, feed snippet, or explicit source metadata.
- Articles must answer what changed, why it matters for AI infrastructure, who benefits, who is exposed, and what bottleneck or decision point readers should watch.
- Consecutive generated items must vary article structure, opening move, paragraph rhythm, and analytical angle.
- Run repetition and source-fidelity evals before publishing or marking generated article copy as publishable.

## Prompt and Fallback Copy Rules

- Do not add fallback language that can be reused unchanged across many articles.
- Do not use these banned generic patterns in generated or fallback article bodies:
  - "The issue is no longer demand alone"
  - "The real test is whether power access can keep pace"
  - "The practical issue is whether demand can be converted into reliable capacity on schedule"
  - "The next signal to watch is customer commitments..."
  - "The financial question is..., the operating question is..., the customer question is..."
- If a phrase is intentionally similar to a banned pattern, keep it only when source facts make it specific, and prefer concrete nouns from the source over reusable abstractions.
- Avoid forcing weakly related AI software, model, app, or consumer news into a data center infrastructure thesis.

## Evaluation Expectations

Before changing publish readiness or content generation behavior, identify where repetition and source-fidelity are checked. If the checks are missing, document that gap rather than assuming the article is safe to publish.

When implementing future behavior changes in this module, tests or verification should cover:

- extraction QA blocking long-form article generation;
- source fidelity for generated claims;
- repeated phrase or repeated structure detection;
- category/product-fit boundaries for weakly related AI news;
- preservation of article search/archive fields.
