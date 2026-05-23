import assert from 'node:assert/strict';
import test from 'node:test';
import {
  cardCopyQualityResult,
  generateCardCopy,
} from '../scripts/lib/card-copy-quality-gate.mjs';

test('card copy gate rejects internal qualification explanations', () => {
  const bad = cardCopyQualityResult({
    title: 'Cloud capacity update',
    deck: 'Compute Current is keeping this short because the item did not qualify for longform.',
    why_it_matters: 'The source evidence was too thin.',
    source: 'Example',
  });

  assert.equal(bad.ok, false);
  assert.ok(bad.reasons.includes('internal_qualification_language'));
});

test('generated card copy uses concrete editorial language and a public CTA', () => {
  const copy = generateCardCopy({
    title: 'Utility queue delay hits a planned AI campus',
    source: 'Utility Dive',
    primary_category: 'Power & Grid',
    infrastructure_layer: 'power',
    summary: 'A named utility delayed interconnection for a planned data center campus.',
    public_content_tier: 'editorial_brief',
  });
  const result = cardCopyQualityResult(copy);

  assert.equal(result.ok, true);
  assert.equal(copy.label, 'Brief');
  assert.equal(copy.cta, 'Read brief');
  assert.match(copy.deck, /(utility|power|campus|data center|interconnection)/i);
});
