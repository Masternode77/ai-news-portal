import assert from 'node:assert/strict';
import test from 'node:test';
import { buildEvidencePackV2 } from '../scripts/lib/evidence-pack-builder-v2.mjs';

test('evidence pack captures facts, layer, stakeholders, and watch metrics', () => {
  const pack = buildEvidencePackV2({
    primary_infrastructure_layer: 'power',
    extracted_facts: ['A 300 MW battery portfolio was announced for grid flexibility.'],
    companies: ['Green Capital'],
    regions: ['Europe'],
    representative_source: { title: '300 MW storage portfolio', cleaned_text: 'A 300 MW battery storage portfolio supports data center power flexibility.' },
  }, []);
  assert.equal(pack.infrastructure_layer, 'power');
  assert.ok(pack.verified_facts.length >= 1);
  assert.ok(pack.watch_metrics.length >= 2);
});
