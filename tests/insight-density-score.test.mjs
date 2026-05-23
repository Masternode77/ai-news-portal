import assert from 'node:assert/strict';
import test from 'node:test';
import { insightDensityScore } from '../scripts/lib/insight-density-score.mjs';

test('insight density score rewards implication and risk language', () => {
  const score = insightDensityScore('The thesis links capacity control, timing risk, cost exposure, delivery milestones, procurement leverage, investor underwriting, operator constraints, utility allocation, supplier timing, site capacity, network delivery, storage availability, and power-market risk to the planning decision.');
  assert.ok(score.insight_density_score >= 0.78);
});
