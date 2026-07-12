import test from 'node:test';
import assert from 'node:assert/strict';
import { checkClaimsAgainstEvidence, seoMetadataClaimsSupported } from '../scripts/lib/source-fidelity-claim-check.mjs';

test('claim checker accepts bodies anchored in evidence terms', () => {
  const result = checkClaimsAgainstEvidence(
    'Data center power capacity remains the central operating risk for buyers. Grid interconnection timing shapes procurement.',
    {
      evidenceText: 'Data center power capacity remains the central operating risk for buyers. Grid interconnection timing shapes procurement.',
    }
  );
  assert.equal(result.ok, true);
});

test('claim checker separates declared analysis from unsupported factual claims', () => {
  const result = checkClaimsAgainstEvidence(
    'The signed lease reduces demand uncertainty for the 300 MW critical IT load. A guaranteed $40 billion payment arrives tomorrow according to a binding contract that the source never disclosed.',
    {
      evidenceText: 'The company signed a 15-year lease for 300 MW of critical IT load.',
      analyticalInferences: [{
        claim: 'The signed lease reduces demand uncertainty for the 300 MW critical IT load.',
        premises: ['The company signed a 15-year lease for 300 MW of critical IT load.'],
      }],
    },
  );
  assert.equal(result.analyticalInferenceClaims.length, 1);
  assert.equal(result.unsupportedClaims.length, 1);
  assert.match(result.unsupportedClaims[0], /40 billion/);
});

test('claim checker rejects a self-declared inference without source-grounded premises', () => {
  const fabricated = 'A guaranteed $40 billion payment arrives tomorrow according to a binding contract that the source never disclosed.';
  const result = checkClaimsAgainstEvidence(fabricated, {
    evidenceText: 'The company signed a 15-year lease for 300 MW of critical IT load.',
    analyticalInferences: [fabricated],
  });

  assert.equal(result.analyticalInferenceClaims.length, 0);
  assert.equal(result.unsupportedClaims.length, 1);
  assert.equal(result.ok, false);
});

test('claim checker rejects a grounded inference that introduces an unsupported number', () => {
  const fabricated = 'The lease guarantees a $40 billion payment tomorrow under a binding schedule that the source never disclosed.';
  const result = checkClaimsAgainstEvidence(fabricated, {
    evidenceText: 'The company signed a 15-year lease for 300 MW of critical IT load.',
    analyticalInferences: [{
      claim: fabricated,
      premises: ['The company signed a 15-year lease for 300 MW of critical IT load.'],
    }],
  });

  assert.equal(result.analyticalInferenceClaims.length, 0);
  assert.equal(result.unsupportedClaims.length, 1);
});

test('claim checker rejects unsupported numeric claims that share source terms', () => {
  const evidencePack = {
    evidenceText: 'Applied Digital signed a 15-year lease for 300 MW of critical IT load.',
    namedActors: ['Applied Digital'],
  };
  const claims = [
    'Applied Digital guarantees a $40 billion payment tomorrow under binding terms that the source never disclosed.',
    'The company guarantees a $40 billion payment tomorrow under a binding schedule that the source never disclosed.',
  ];

  for (const claim of claims) {
    const result = checkClaimsAgainstEvidence(claim, evidencePack);
    assert.equal(result.ok, false, claim);
    assert.equal(result.unsupportedClaims.length, 1, claim);
  }
});

test('claim checker rejects unsupported predicates appended to source actors and actions', () => {
  const evidencePack = {
    evidenceText: 'Applied Digital signed an estimated 15-year lease for 300 MW of critical IT load.',
  };
  const claims = [
    'Applied Digital signed a lease that guarantees immediate rent commencement under binding terms.',
    'Applied Digital will deliver the campus tomorrow because the lease guarantees the future schedule.',
  ];

  for (const claim of claims) {
    const result = checkClaimsAgainstEvidence(claim, evidencePack);
    assert.equal(result.ok, false, claim);
    assert.equal(result.unsupportedClaims.length, 1, claim);
  }
});

test('claim checker validates concise body claims instead of dropping them', () => {
  const evidencePack = {
    evidenceText: 'Applied Digital signed a 15-year lease for 300 MW of critical IT load.',
  };
  for (const claim of [
    'A guaranteed $40 billion payment arrives tomorrow.',
    'The lease guarantees immediate rent commencement.',
  ]) {
    const result = checkClaimsAgainstEvidence(claim, evidencePack);
    assert.equal(result.totalClaims, 1, claim);
    assert.equal(result.ok, false, claim);
  }
});

test('claim checker does not treat the same number with a different unit as evidence', () => {
  const result = checkClaimsAgainstEvidence(
    'The lease guarantees a $500 million annual payment under binding terms.',
    { evidenceText: 'The data center campus spans more than 500 acres.' },
  );

  assert.equal(result.ok, false);
  assert.equal(result.unsupportedClaims.length, 1);
});

test('claim checker validates compact numeric units without allowing unit collisions', () => {
  const evidencePack = {
    evidenceText: 'Applied Digital signed a lease for 300 MW of critical IT load.',
  };
  const supported = checkClaimsAgainstEvidence(
    'Applied Digital signed a lease for 300MW of critical IT load.',
    evidencePack,
  );
  const unsupported = checkClaimsAgainstEvidence(
    'Applied Digital signed a lease for 300GW of critical IT load.',
    evidencePack,
  );

  assert.equal(supported.ok, true);
  assert.equal(unsupported.ok, false);
  assert.equal(unsupported.unsupportedClaims.length, 1);
});

test('claim checker rejects compact financial units unsupported by the evidence', () => {
  const result = checkClaimsAgainstEvidence(
    'Applied Digital signed a lease worth $40B for critical IT load.',
    { evidenceText: 'Applied Digital signed a lease worth $40 for critical IT load.' },
  );

  assert.equal(result.ok, false);
  assert.equal(result.unsupportedClaims.length, 1);
});

test('claim checker validates punctuationless factual blocks but skips standalone headings', () => {
  const result = checkClaimsAgainstEvidence(
    'Delivery Risk\n\nA guaranteed payment arrives tomorrow',
    { evidenceText: 'The company signed a lease for critical IT load.' },
  );

  assert.equal(result.totalClaims, 1);
  assert.equal(result.ok, false);
  assert.match(result.unsupportedClaims[0], /guaranteed payment/i);
});

test('claim checker validates factual title-case blocks instead of treating them as headings', () => {
  const result = checkClaimsAgainstEvidence(
    'Delivery Risk\n\nApplied Digital Signed a Guaranteed $40B Lease',
    { evidenceText: 'Applied Digital signed a lease for 300 MW of critical IT load.' },
  );

  assert.equal(result.totalClaims, 1);
  assert.equal(result.ok, false);
  assert.match(result.unsupportedClaims[0], /\$40B Lease/i);
});

test('declared analysis must be related to its premises and cannot add certainty', () => {
  const claim = 'The signed lease guarantees immediate rent commencement for the campus.';
  const result = checkClaimsAgainstEvidence(claim, {
    evidenceText: 'The company signed a 15-year lease for 300 MW of critical IT load at the campus.',
    analyticalInferences: [{
      claim,
      premises: ['The company signed a 15-year lease for 300 MW of critical IT load at the campus.'],
    }],
  });

  assert.equal(result.analyticalInferenceClaims.length, 0);
  assert.equal(result.unsupportedClaims.length, 1);
  assert.equal(result.ok, false);
});

test('declared analysis cannot use generic source words to attach guaranteed economics to a lease premise', () => {
  const evidenceText = 'The source filing says the tenant signed a lease for 430 MW of capacity. The developer has not disclosed construction financing.';
  const premise = 'The source filing says the tenant signed a lease for 430 MW of capacity.';

  for (const claim of [
    'The source says construction financing is guaranteed.',
    'The filing says financing is guaranteed.',
    'The tenant lease guarantees rent.',
  ]) {
    const result = checkClaimsAgainstEvidence(claim, {
      evidenceText,
      facts: [
        premise,
        'The developer has not disclosed construction financing.',
      ],
      analyticalInferences: [{ claim, premises: [premise] }],
    });

    assert.equal(result.analyticalInferenceClaims.length, 0, claim);
    assert.equal(result.unsupportedClaims.length, 1, claim);
    assert.equal(result.ok, false, claim);
  }
});

test('claim checker evaluates unsupported claims after the first 30 sentences', () => {
  const supported = 'Grid interconnection timing shapes data center procurement and power capacity planning.';
  const unsupported = 'A guaranteed $40 billion payment arrives tomorrow under a binding schedule that the source never disclosed.';
  const result = checkClaimsAgainstEvidence(
    [...Array.from({ length: 30 }, () => supported), unsupported].join(' '),
    { evidenceText: 'grid interconnection timing data center procurement power capacity planning' },
  );

  assert.equal(result.totalClaims, 31);
  assert.equal(result.ok, false);
  assert.match(result.unsupportedClaims.at(-1), /40 billion/);
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

test('SEO metadata validates a single punctuationless field', () => {
  const result = seoMetadataClaimsSupported({
    deck: 'Guaranteed revenue surge next quarter',
  }, {
    evidenceText: 'grid interconnection timing power capacity procurement data center buyers deployment plans',
  });

  assert.equal(result.totalClaims, 1);
  assert.equal(result.ok, false);
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
