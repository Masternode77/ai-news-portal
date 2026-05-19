import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateMonetizationReadiness } from '../scripts/lib/monetization-readiness-gate.mjs';
import { evaluatePremiumArticleQuality } from '../scripts/lib/premium-article-quality-gate.mjs';
import { routePublicLane } from '../scripts/lib/public-lane-router.mjs';

const strongParagraph = 'Bottom line: Power availability, operator exposure, procurement cost, and investor risk all change when a data center campus faces interconnection delay, utility cost allocation, and cooling readiness constraints. Operators should watch the interconnection queue, megawatt delivery dates, contract terms, and supplier lead times as the key metric for deployment timing.';

test('monetization gate downgrades weak consumer topics before core monetization', () => {
  const article = {
    title: 'Best gaming laptop deals for AI creators',
    summary: 'Consumer laptop deals with generic AI tools and no data center, power, silicon supply, or enterprise infrastructure procurement angle.',
    articleText: strongParagraph.repeat(5),
    infrastructure_relevance_score: 0.91,
    public_routing: { ...routePublicLane({ title: 'AI data center power grid cooling', summary: 'power grid data center cooling', infrastructure_relevance_score: 0.91 }), visibility: 'core' },
  };
  const result = evaluateMonetizationReadiness(article);
  assert.equal(result.ok, true);
  assert.equal(result.route.visibility, 'archive');
  assert.match(result.route.blocked_reasons.join(' '), /outside_compute_current_product_boundary/);
});

test('premium quality gate rejects short summaries sold as Pro analysis', () => {
  const result = evaluatePremiumArticleQuality({
    access_level: 'pro',
    title: 'Short source card',
    articleText: 'A short signal card about a data center power topic.',
  });
  assert.equal(result.ok, false);
  assert.match(result.reasons.join(' '), /min_visible_body_chars/);
});

test('premium quality gate accepts longform original analysis with required elements', () => {
  const articleText = Array.from({ length: 7 }, (_, index) =>
    `${strongParagraph} Counterpoint ${index}: a buyer may still delay because capex, procurement, commercial pricing, and utility exposure can move faster than facility readiness. The watch metric is the signed megawatt delivery schedule and supplier lead-time variance.`
  ).join('\n\n');
  const result = evaluatePremiumArticleQuality({
    access_level: 'pro',
    source_backed_facts: ['200 MW', '2027 delivery', 'utility tariff', 'liquid cooling'],
    articleText,
  });
  assert.equal(result.ok, true);
});
