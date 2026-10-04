import assert from 'node:assert/strict';
import test from 'node:test';
import { insightDensityScore } from '../scripts/lib/insight-density-score.mjs';

test('insight density score rewards implication and risk language', () => {
  const score = insightDensityScore('The thesis links capacity control, timing risk, cost exposure, delivery milestones, procurement leverage, investor underwriting, operator constraints, utility allocation, supplier timing, site capacity, network delivery, storage availability, and power-market risk to the planning decision.');
  assert.ok(score.insight_density_score >= 0.78);
});

test('inflected forms count like the base terms', () => {
  const plural = insightDensityScore('Investors, operators and suppliers carry the costs and risks of these constraints, and utilities set the allocations.');
  const singular = insightDensityScore('The investor, operator and supplier carry the cost and risk of this constraint, and the utility sets the allocation.');
  assert.equal(plural.insight_density_score, singular.insight_density_score);
  assert.ok(plural.insight_density_score > insightDensityScore('Plain prose with none of the decision words.').insight_density_score);
  assert.equal(insightDensityScore('A riskier costume for the controller.').insight_density_score, 0.68, 'words that merely start with a term do not count');
});
