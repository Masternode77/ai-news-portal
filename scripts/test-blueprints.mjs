import assert from 'node:assert/strict';
import {
  ARTICLE_BLUEPRINTS,
  bodyUsesBlueprint,
  blueprintFallbackBody,
  blueprintHistoryFromRecords,
  selectArticleBlueprint,
} from './lib/article-blueprints.mjs';
import { extractExpertInsight } from './lib/expert-insight-engine.mjs';
import { attachExpertLens } from './lib/expert-lens.mjs';

const [firstBlueprint] = ARTICLE_BLUEPRINTS;

const forcedAlternative = selectArticleBlueprint(
  {
    id: 'repeat-breaker',
    title: 'Utility interconnection queue reshapes AI data center schedule',
    source: 'Test Source',
    category: 'Power & Grid',
  },
  [firstBlueprint.id, firstBlueprint.id]
);

assert.notEqual(
  forcedAlternative.id,
  firstBlueprint.id,
  'blueprint selector must not choose a third consecutive use'
);

const fallbackBody = blueprintFallbackBody(
  {
    id: 'fallback-body',
    title: 'Cloud provider adds liquid-cooled AI capacity in Texas',
    source: 'Compute Current Test',
    category: 'Cooling & Facility Engineering',
    summary: 'The provider said it is adding liquid-cooled capacity for AI workloads.',
  },
  {
    thesis: 'The change matters because higher-density capacity needs facility-level execution.',
    whatHappened: 'The provider announced a new block of AI capacity with liquid cooling support.',
    whyThisMatters: 'Cooling readiness can determine whether accelerators become usable capacity.',
    marketMissing: 'The hidden constraint is the facility retrofit timeline.',
    investors: 'Capital providers benefit when delivery schedules become clearer.',
    operators: 'Operators are exposed if supply chain or commissioning windows slip.',
    hyperscalers: 'Cloud buyers gain more optionality when capacity is tied to realistic thermal design.',
    watchNext: 'Watch whether the company discloses commissioning dates and customer commitments.',
    category: 'Cooling & Facility Engineering',
  },
  firstBlueprint
);

for (const heading of firstBlueprint.sectionHeadings) {
  assert.match(fallbackBody, new RegExp(`(^|\\n\\n)${heading}(\\n\\n|$)`), `fallback body should include ${heading}`);
}
assert.ok(bodyUsesBlueprint(fallbackBody, firstBlueprint), 'fallback body should follow selected blueprint headings');

const blueprintArticle = {
  id: 'blueprint-persisted',
  title: 'Microsoft power constraints delay a 300 MW AI data center campus',
  source: 'Compute Current Test',
  category: 'Power & Grid',
  primary_category: 'Power & Grid',
  infrastructure_layer: 'Power & Energy',
  summary: 'Microsoft said a planned campus faces power delivery delays tied to grid equipment availability.',
  snippet: 'The project includes 300 MW of planned load and a 2027 energization target.',
  articleText:
    'Microsoft said a planned AI data center campus faces power delivery delays tied to grid equipment availability, utility timelines, transformer procurement, and a 2027 energization target for 300 MW of planned load.',
  sourceUrl: 'https://example.com/power-delay',
  publishedAt: '2026-05-17T00:00:00.000Z',
};
const blueprintInsight = extractExpertInsight(blueprintArticle);

const enriched = await attachExpertLens(
  [
    {
      ...blueprintArticle,
      expert_insight: blueprintInsight,
      expertInsight: blueprintInsight,
    },
  ],
  { recentBlueprintIds: [firstBlueprint.id, firstBlueprint.id] }
);

assert.equal(enriched.length, 1);
assert.ok(enriched[0].article_blueprint, 'selected blueprint must be persisted at article level');
assert.equal(enriched[0].article_blueprint, enriched[0].articleBlueprint.id);
assert.equal(enriched[0].article_blueprint, enriched[0].expertLensFull.blueprintId);
assert.notEqual(enriched[0].article_blueprint, firstBlueprint.id, 'generation path must honor repeat breaker');

const history = blueprintHistoryFromRecords([
  { publishedAt: '2026-05-16T00:00:00.000Z', article_blueprint: ARTICLE_BLUEPRINTS[1].id },
  { publishedAt: '2026-05-17T00:00:00.000Z', expertLensFull: { blueprintId: ARTICLE_BLUEPRINTS[2].id } },
]);

assert.deepEqual(history.slice(0, 2), [ARTICLE_BLUEPRINTS[2].id, ARTICLE_BLUEPRINTS[1].id]);

console.log('article blueprint selection tests passed');
