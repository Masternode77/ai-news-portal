---
version: 2026-11-16.1
status: approved — Josh 2026-11-16 ("3e 1단계 승인"). Rendered into prompts/insight_essay.md by an include line: a change here changes the prompt, so bump that prompt's version too
content_type: insight_essay
schema: packages/shared/src/schema/content.ts InsightEssay / InsightEssayDraft (fields below; QA ESSAY_STRUCTURE checks the ranges, config/qa.yaml)
voice: content/voice/josh_voice.md
---

# insight_essay — structure template (The Current)

One essay is one reading of one consequential development, in English, under Josh Jiwoon Inn's byline. Published at `/column/<slug>-YYYY-MM-DD/`. At most one per day (`config/pipeline.yaml` `caps.essays_per_day`).

## 1. Fields the model writes

| Field | Length | What it is |
|---|---|---|
| `title` | 40–90 characters, sentence case | The reading, not the news. Names the subject and the claim. |
| `deck` | 1–2 sentences, 120–280 characters | The evidence in one line, then the reading. Shown under the title and as the meta description. |
| `thesis` | one sentence, 40–300 characters | The claim the essay defends, stated so it could be wrong. |
| `body` | 800–1,300 words, 3–4 sections | The argument (section 2 below), in Markdown with `##` headings. |
| `counterpoint` | 150–300 words, 1 section | The strongest case against the thesis (section 3). Starts with its own `##` heading. |
| `implications` | 150–300 words, 1 section | Two or three conditional observables (section 4). Starts with its own `##` heading. |
| `tags` | 3–6 | Lowercase topic tags. |

The stage fills `sources`, `published_at`, `slug`, `image` and the byline from the candidate. The model never writes URLs, dates or source names it was not given.

Total essay length: 1,100–1,900 words, which is the range of the seven published columns (1,144–1,915).

## 2. `body` — the argument

1. **Opening paragraph (no heading).** The source facts that make this worth reading, every number attributed inline ("according to the U.S. Energy Information Administration"). Use one opening device and vary it from essay to essay: a number, a contradiction, a filing detail, a price, a deadline.
2. **Reading paragraph (no heading).** The thesis in plain words, with the evidence boundary stated: what the source shows, and where the essay goes past it.
3. **Two or three sections, each with a `##` heading written for this argument.** Each section does one job:
   - what the evidence actually establishes (milestones, units, period, comparator);
   - who gains leverage and who carries the risk, only as far as the evidence supports;
   - the decision rule a buyer, operator, lender or investor should take from it, labelled as analysis.
   Each section ends on a short verdict sentence. Mark inference where the argument passes the source.

## 3. `counterpoint` — the other side, at full strength

- A `##` heading written for this argument (for example "The case that this is temporary"), never a generic one.
- The best case against the thesis, with the evidence that would support it.
- Then either why the author weighs it less, citing the evidence, or an honest concession that narrows the thesis.
- It must weaken the thesis. A counterpoint that restates the thesis fails review.

## 4. `implications` — what would settle it

- A `##` heading written for this essay, never "What to watch" or another retired heading.
- Two or three concrete observables: a filing, a queue update, an earnings disclosure, a tariff decision, a contract milestone.
- For each, what it would mean either way ("if … then …; if … then …").
- No invented dates. When the source gives no date, say so.

## 5. Sources and evidence

- At least one primary or first-hand source: the candidate article, filing, dataset or official release. More are welcome when the run holds other items on the same event.
- Every number appears in a source, with its unit and period. No conversion across units unless the source gives the factor.
- Quotations: at most one direct quote of the source, at most 20 words (same rule as news briefs).
- No claim about what a source omits on the strength of a short extract.

## 6. Example skeleton

Shape only, taken from the ERCOT column of 2026-09-16; do not reuse its words.

```
title: ERCOT's six-week demand record turns Texas interconnection into a capacity gate
deck: Six weeks of ERCOT load above the 2023 record, alongside a moratorium on new data-center interconnections, means Texas buyers should price interconnection delay as delivery risk.
thesis: Texas data-center buyers should price interconnection delay as delivery risk rather than a permitting nuisance.
body:
  [facts: weekly load figures, the prior record, the moratorium — all attributed]
  [reading: announced megawatts without energization dates are speculative capacity; inference marked]
  ## Six weeks is not weather noise
  ## Firm power versus aspirational power
counterpoint:
  ## The case that this is temporary
implications:
  ## Three checkpoints that reveal the real timeline
```
