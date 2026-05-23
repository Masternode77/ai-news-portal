import assert from 'node:assert/strict';
import test from 'node:test';
import { selectEditorialSignals } from '../scripts/lib/editorial-selection-engine.mjs';

test('editorial selection rejects generic consumer/app AI even with a high score', () => {
  const selection = selectEditorialSignals([
    {
      cluster_id: 'generic-search',
      cluster_title: 'Google redesigned the search box for AI design',
      cluster_topic: 'consumer AI design',
      primary_infrastructure_layer: 'Compute',
      extracted_facts: ['Google changed the search interface.', 'The product affects users.', 'The design changed.', 'The launch is public.'],
      numeric_claims: [{ raw: '25 years' }],
      signal_score: 88,
    },
  ]);
  assert.equal(selection.selected_for_analysis.length, 0);
  assert.equal(selection.held_signals.length, 0);
  assert.equal(selection.rejected_signals.length, 1);
});
