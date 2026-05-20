import assert from 'node:assert/strict';
import test from 'node:test';
import { humanStyleScore } from '../scripts/lib/human-style-score.mjs';

test('human style score rewards varied analyst paragraphs with thesis language', () => {
  const text = [
    'Thesis',
    'The thesis is that power timing now matters more than headline demand. '.repeat(35),
    'Evidence',
    'Operators should treat the 300 MW signal as a planning checkpoint, not finished capacity. '.repeat(28),
    'Commercial read',
    'The market implication is about control, timing, risk, capacity, delivery, procurement, investor leverage, and supplier exposure. '.repeat(24),
    'Operating read',
    'The operating read depends on utility milestones, interconnection timing, cost exposure, and delivery risk. '.repeat(24),
    'Counterargument',
    'The counterargument is that storage projects can slip before interconnection and procurement are settled. '.repeat(18),
    'Watch metrics',
    'A buyer would watch delivery dates, grid participation, contract quality, utility tariffs, and capacity milestones before changing spend. '.repeat(18),
    'Bottom line',
    'Bottom line: the signal earns attention only if milestones become observable and verified. '.repeat(12),
  ].join('\n\n');
  const score = humanStyleScore(text);
  assert.ok(score.human_style_score >= 0.84);
});
