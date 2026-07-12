import assert from 'node:assert/strict';
import test from 'node:test';

import { buildArticleReadingModel } from '../src/lib/article-reading-model.js';

test('reading model promotes only existing public-facing article facts', () => {
  const article = {
    executiveSummary: [
      'SoftBank said it plans up to €75 billion of French data center investment.',
      'The first phase targets 3.1 gigawatts of capacity by 2031.',
    ],
    evidence_pack: {
      verified_facts: [
        'SoftBank Group announced plans to expand data center capacity in France.',
        'The first phase names Dunkirk, Bosquel, and Bouchain as sites.',
        'The company described the plan as its largest AI infrastructure investment in Europe.',
      ],
      watch_metrics: [
        'Interconnection queue movement and tariff exposure.',
        'Contracted capacity, delivery timing, and operating cost variance.',
      ],
      uncertainty: [
        'The source describes planned capacity and sites, but execution depends on power delivery and commissioning milestones.',
      ],
    },
    editorial_thesis: {
      bottom_line: 'The announcement matters if capital, grid access, and site delivery converge into commissioned AI capacity.',
    },
  };
  const presentation = {
    deck: 'The deal ties AI buildout timing to power procurement and utility capacity.',
    why_it_matters: 'Capacity planners get a clearer checkpoint for European AI infrastructure supply.',
  };

  const model = buildArticleReadingModel(article, presentation);

  assert.deepEqual(model.executiveSummary, [
    'The deal ties AI buildout timing to power procurement and utility capacity.',
    'Capacity planners get a clearer checkpoint for European AI infrastructure supply.',
    'SoftBank said it plans up to €75 billion of French data center investment.',
  ]);
  assert.deepEqual(model.sourceFacts, [
    'SoftBank Group announced plans to expand data center capacity in France.',
    'The first phase names Dunkirk, Bosquel, and Bouchain as sites.',
    'The company described the plan as its largest AI infrastructure investment in Europe.',
  ]);
  assert.deepEqual(model.watchItems, [
    'Interconnection queue movement and tariff exposure.',
    'Contracted capacity, delivery timing, and operating cost variance.',
  ]);
  assert.equal(
    model.evidenceLimitation,
    'The source describes planned capacity and sites, but execution depends on power delivery and commissioning milestones.'
  );
  assert.equal(
    model.bottomLine,
    'The announcement matters if capital, grid access, and site delivery converge into commissioned AI capacity.'
  );
});

test('reading model fails closed on internal metrics and thin inputs', () => {
  const model = buildArticleReadingModel({
    executiveSummary: [
      'Quality score 92 out of 100 with strong extraction.',
      '',
    ],
    evidence_pack: {
      verified_facts: [
        'Relevance score passed threshold.',
        'Verified fact count is 5.',
      ],
      watch_metrics: [
        'Noindex routing decision should change.',
      ],
      uncertainty: [
        'Unsupported claim count is zero.',
      ],
    },
    editorial_thesis: {
      bottom_line: 'Source fidelity score is high.',
    },
  }, {
    deck: 'Publishable because QA passed.',
    why_it_matters: 'Extraction threshold was met.',
  });

  assert.deepEqual(model, {
    executiveSummary: [],
    sourceFacts: [],
    evidenceLimitation: '',
    watchItems: [],
    bottomLine: '',
  });
});

test('reading model can derive facts from verified claim ledger entries', () => {
  const model = buildArticleReadingModel({
    claim_ledger: [
      {
        verification_status: 'verified_primary',
        claim_text: 'The utility filing names two substations as prerequisites for first energization.',
      },
      {
        verification_status: 'needs_review',
        claim_text: 'This unverified sentence must not appear.',
      },
      {
        verification_status: 'unverified',
        claim_text: 'A substring match must not promote this claim.',
      },
      {
        verification_status: 'not_verified',
        claim_text: 'A negated status must not promote this claim.',
      },
    ],
  });

  assert.deepEqual(model.sourceFacts, [
    'The utility filing names two substations as prerequisites for first energization.',
  ]);
  assert.deepEqual(model.executiveSummary, [
    'The utility filing names two substations as prerequisites for first energization.',
  ]);
});

test('reading model promotes anchored facts and watch checkpoints from a published body', () => {
  const model = buildArticleReadingModel({
    source_fidelity: {
      anchored_facts: [
        'The campus is designed around 430 MW of utility power.',
        'The tenant was not named.',
      ],
    },
    expertLensShort: 'Delivery still depends on power, financing, construction, and commissioning.',
    expertLensFull: {
      finalArticleBody: `Opening analysis.\n\nThe Evidence To Watch\n\nThe first checkpoint is whether project financing closes. Later filings should clarify rent commencement and delivery timing.`,
    },
  });

  assert.deepEqual(model.sourceFacts, [
    'The campus is designed around 430 MW of utility power.',
    'The tenant was not named.',
  ]);
  assert.equal(model.evidenceLimitation, 'The tenant was not named.');
  assert.deepEqual(model.watchItems, [
    'The first checkpoint is whether project financing closes.',
    'Later filings should clarify rent commencement and delivery timing.',
  ]);
  assert.equal(model.bottomLine, 'Delivery still depends on power, financing, construction, and commissioning.');
});
