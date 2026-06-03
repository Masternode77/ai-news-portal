import test from 'node:test';
import assert from 'node:assert/strict';
import { checkClaimsAgainstEvidence, seoMetadataClaimsSupported } from '../scripts/lib/source-fidelity-claim-check.mjs';

test('claim checker accepts bodies anchored in evidence terms', () => {
  const result = checkClaimsAgainstEvidence(
    'Data center power capacity remains the central operating risk for buyers. Grid interconnection timing shapes procurement.',
    { evidenceText: 'data center power capacity grid interconnection procurement timing' }
  );
  assert.equal(result.ok, true);
});

test('SEO metadata claims must be supported by source evidence', () => {
  const supported = seoMetadataClaimsSupported({
    title: 'Grid interconnection timing shapes data center procurement',
    deck: 'Grid interconnection timing changes procurement risk for data center buyers.',
    why_it_matters: 'Power capacity and procurement timing affect deployment plans.',
    expertLensFull: {
      metaDescription: 'Grid interconnection timing changes procurement risk for data center buyers.',
    },
  }, {
    evidenceText: 'grid interconnection timing power capacity procurement data center buyers deployment plans',
  });
  const unsupported = seoMetadataClaimsSupported({
    title: 'Grid interconnection timing shapes data center procurement',
    deck: 'A guaranteed $40 billion revenue surge will arrive next quarter.',
    why_it_matters: 'Power capacity and procurement timing affect deployment plans.',
    expertLensFull: {
      metaDescription: 'A guaranteed $40 billion revenue surge will arrive next quarter.',
    },
  }, {
    evidenceText: 'grid interconnection timing power capacity procurement data center buyers deployment plans',
  });

  assert.equal(supported.ok, true);
  assert.equal(unsupported.ok, false);
  assert.ok(unsupported.unsupportedClaims.some((claim) => /40 billion revenue/i.test(claim)));
});

test('SEO metadata rejects unsupported short claims', () => {
  const result = seoMetadataClaimsSupported({
    deck: 'Guaranteed revenue surge next quarter.',
  }, {
    evidenceText: 'grid interconnection timing power capacity procurement data center buyers deployment plans',
  });

  assert.equal(result.ok, false);
  assert.ok(result.totalClaims > 0);
  assert.ok(result.unsupportedClaims.some((claim) => /Guaranteed revenue surge next quarter/i.test(claim)));
});

test('SEO metadata accepts supported short claims', () => {
  const result = seoMetadataClaimsSupported({
    title: 'Grid timing shapes procurement.',
    deck: 'Power capacity affects deployment.',
  }, {
    evidenceText: 'grid timing shapes procurement power capacity affects deployment',
  });

  assert.equal(result.ok, true);
  assert.equal(result.unsupportedClaims.length, 0);
});
