import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  cardCopyQualityResult,
  generateCardCopy,
} from '../scripts/lib/card-copy-quality-gate.mjs';
import { buildHomepageFeed } from '../scripts/lib/homepage-feed-builder.mjs';
import { buildPublicPresentation } from '../scripts/lib/public-presentation.mjs';
import { authorizePublicTestRecords } from './fixtures/admin-publication-integrity.mjs';

function maxDuplicateCount(values = []) {
  const counts = new Map();
  for (const value of values) {
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  return Math.max(0, ...counts.values());
}

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

test('card copy gate rejects compact-signal fallback language', () => {
  const bad = cardCopyQualityResult({
    title: 'Regional procurement update',
    deck: 'Regional procurement update gives infrastructure readers a compact signal on AI capacity planning, supplier timing, or operating risk.',
    why_it_matters: 'Procurement constraints can change build schedules, buyer commitments, and cost assumptions before demand shows up in revenue.',
    source: 'Example',
  });

  assert.equal(bad.ok, false);
  assert.ok(bad.reasons.includes('internal_qualification_language'));
});

test('card copy gate rejects raw why-it-matters label prefixes', () => {
  const bad = cardCopyQualityResult({
    title: 'Grid queue update',
    deck: 'Grid queue update shows where interconnection timing can decide AI campus delivery schedules.',
    why_it_matters: 'Why it matters: grid access is the delivery constraint for AI campus delivery.',
    source: 'Example',
  });

  assert.equal(bad.ok, false);
  assert.ok(bad.reasons.includes('why_it_matters_label_prefix'));
});

test('card copy gate rejects visible standalone blueprint in public card fields', () => {
  const bad = cardCopyQualityResult({
    title: 'Grid capacity update',
    deck: 'The source described a deployment blueprint for grid capacity planning with named operators and procurement timing.',
    why_it_matters: 'The grid update changes interconnection timing for AI campus delivery.',
    source: 'Example Source',
  });

  assert.equal(bad.ok, false);
  assert.ok(bad.reasons.includes('internal_public_language'));
});

test('card copy gate allows industrial power generation wording', () => {
  const result = cardCopyQualityResult({
    title: 'Backup generation permits affect AI campus timing',
    deck: 'County filings tie backup generation permits and substation delivery to the opening schedule for a planned AI data center campus.',
    why_it_matters: 'Power generation constraints can change commissioning dates, buyer commitments, and utility upgrade sequencing.',
    source: 'Example Source',
  });

  assert.equal(result.ok, true);
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

test('current signal cards preserve the source meaning instead of inventing infrastructure consequences', () => {
  const records = JSON.parse(fs.readFileSync('src/data/latest-news.json', 'utf8'));
  const cases = [
    {
      id: 'd4f156c55959b5d6',
      expected: /pod density|dormant memory|node swap/i,
      forbidden: /chip allocation|power budgets|cloud margin pressure/i,
    },
    {
      id: 'a3b7a774d9504e99',
      expected: /GPU sharing|vRAN|1\.5ms|Llama-3\.3-70B/i,
      forbidden: /interconnection dates|substation|campus schedules/i,
    },
    {
      id: 'b8a3286414469197',
      expected: /Hinkley Point B|decommission/i,
      forbidden: /AI campus|interconnection|substation/i,
    },
  ];

  for (const example of cases) {
    const article = records.find((record) => record.id === example.id);
    assert.ok(article, `missing regression record ${example.id}`);
    const presentation = buildPublicPresentation(article);
    const visible = `${presentation.deck} ${presentation.why_it_matters}`;
    assert.match(visible, example.expected, article.title);
    assert.doesNotMatch(visible, example.forbidden, article.title);
    assert.equal(cardCopyQualityResult(presentation, article).ok, true, article.title);
  }
});

test('current source cards select a second fact instead of repeating a title-prefixed deck', () => {
  const records = JSON.parse(fs.readFileSync('src/data/latest-news.json', 'utf8'));
  const cases = [
    {
      id: 'b8a3286414469197',
      why: /managed by NDA subsidiary Nuclear Restoration Services.*Hinkley Point A/i,
    },
    {
      id: '1376fed4a5670f48',
      why: /AlphaFold2 is written in JAX.*Google Cloud TPUs/i,
    },
    {
      id: '3f7f9d722c7f20df',
      why: /variability of AI workloads.*electrical power delivery/i,
    },
  ];

  for (const example of cases) {
    const article = records.find((record) => record.id === example.id);
    assert.ok(article, `missing regression record ${example.id}`);
    const presentation = buildPublicPresentation(article);
    const deck = presentation.deck.toLowerCase();
    const why = presentation.why_it_matters.toLowerCase();

    assert.match(presentation.why_it_matters, example.why);
    assert.notEqual(why, deck);
    assert.equal(why.includes(deck), false);
    assert.equal(deck.includes(why), false);
    assert.equal(why.startsWith(article.title.toLowerCase()), false);
    assert.equal(cardCopyQualityResult(presentation, article).ok, true, article.title);
  }
});

test('arXiv first-person fallback copy is explicitly attributed to the abstract', () => {
  const copy = generateCardCopy({
    id: 'arxiv-first-person',
    title: 'Cloud inference utilization study',
    source: 'arXiv',
    summary: 'The paper examines scheduler behavior and accelerator utilization for cloud inference workloads.',
    cleaned_source_text: 'We evaluate cloud inference utilization across several scheduler configurations and document the measured operating differences.',
    primary_category: 'Cloud Capacity',
    infrastructure_layer: 'cloud',
    public_content_tier: 'editorial_brief',
  });

  assert.equal(copy.why_it_matters, 'From the abstract: We evaluate cloud inference utilization across several scheduler configurations and document the measured operating differences.');
});

test('a summary-only card leaves why-it-matters empty instead of restating its title', () => {
  const article = {
    id: 'summary-only-card',
    title: 'Cloud capacity procurement update',
    source: 'Example Source',
    summary: 'Cloud capacity procurement remains the only source-backed statement available for this infrastructure update.',
    primary_category: 'Cloud Capacity',
    infrastructure_layer: 'cloud',
    public_content_tier: 'editorial_brief',
  };
  const copy = generateCardCopy(article);

  assert.equal(copy.why_it_matters, '');
  assert.equal(cardCopyQualityResult(copy, article).ok, true);
});

test('current DOE card keeps U.S. abbreviations inside complete sourced sentences', () => {
  const records = JSON.parse(fs.readFileSync('src/data/latest-news.json', 'utf8'));
  const article = records.find((record) => record.id === 'ba17df47777bdce5');

  assert.ok(article, 'missing DOE regression record ba17df47777bdce5');
  const presentation = buildPublicPresentation(article);

  assert.doesNotMatch(presentation.why_it_matters, /Ohio The U\.S\.$/);
  assert.doesNotMatch(presentation.why_it_matters, /\b(?:[A-Za-z]\.){2,}$/);
  assert.match(presentation.why_it_matters, /13-state PJM Interconnection, L\.L\.C\. region\.$/);
  assert.equal(cardCopyQualityResult(presentation, article).ok, true);
});

test('fallback sentence extraction does not split a U.S. agency name', () => {
  const copy = generateCardCopy({
    title: 'Nuclear modernization changes regional power planning',
    source: 'U.S. Department of Energy',
    primary_category: 'Power & Grid',
    infrastructure_layer: 'power',
    summary: 'Regional grid planning now includes a conditional nuclear modernization commitment in Pennsylvania and Ohio.',
    cleaned_source_text: 'The U.S. Department of Energy announced a conditional loan commitment for nuclear uprates in Pennsylvania and Ohio. The projects remain subject to closing conditions.',
    public_content_tier: 'editorial_brief',
  });

  assert.equal(copy.why_it_matters, 'The U.S. Department of Energy announced a conditional loan commitment for nuclear uprates in Pennsylvania and Ohio.');
});

test('generated card copy does not fall back to compact-signal framing', () => {
  const copy = generateCardCopy({
    title: 'Regional procurement update changes buyer timing',
    source: 'Test Source',
    primary_category: 'Operations',
    infrastructure_layer: 'procurement',
    summary: 'A buyer timing update changes how operators sequence AI infrastructure delivery.',
    public_content_tier: 'editorial_brief',
  });

  assert.doesNotMatch(copy.deck, /gives infrastructure readers a compact signal/i);
  assert.doesNotMatch(copy.deck, /compact signal on AI capacity planning/i);
});

test('generated card copy fails product fit for weak general AI items', () => {
  const weakItems = [
    'AI Is Reshaping Self-Driving Cars, Wayve CEO Says',
    'Vibe coding is spreading, but engineering is not going away',
    'Orlando Bravo Says Thoma Bravo Has Become AI-Centric',
  ].map((title, index) => ({
    id: `weak-general-ai-${index}`,
    title,
    source: 'Bloomberg Technology',
    summary: `${title} remains a source-linked AI infrastructure signal.`,
    articleText: `${title} remains a source-linked AI infrastructure signal.`,
    primary_category: 'AI Infrastructure',
    infrastructure_layer: 'Compute',
    infrastructure_relevance_score: 0.62,
    public_content_tier: 'signal_card',
  }));

  for (const article of weakItems) {
    const copy = generateCardCopy(article);
    const result = cardCopyQualityResult(copy, article);

    assert.equal(result.ok, false, article.title);
    assert.ok(result.reasons.includes('unsupported_product_fit'), article.title);
  }
});

test('generated card copy strips terminal title punctuation before fallback subjects', () => {
  const copy = generateCardCopy({
    id: 'punctuated-title-fallback',
    title: 'Bloomberg Intelligence on AI agents in the enterprise.',
    source: 'Bloomberg Technology',
    primary_category: 'Cloud Platform',
    infrastructure_layer: 'cloud',
    public_content_tier: 'signal_card',
  });

  assert.doesNotMatch(copy.deck, /enterprise\\.\\s+tracks/i);
  assert.doesNotMatch(copy.why_it_matters, /enterprise\\.\\s+changes/i);
  assert.doesNotMatch(copy.why_it_matters, /enterprise\\.\\s+puts/i);
});

test('generated card copy selects a safe display title when source title contains audit-only internal wording', () => {
  const copy = generateCardCopy({
    title: 'Google: The agentic era: Architecting the blueprint for mission impact across the public sector',
    source: 'Google Cloud Blog',
    primary_category: 'Cloud Capacity',
    infrastructure_layer: 'cloud capacity',
    public_content_tier: 'signal_card',
  });

  assert.equal(copy.title, 'Google Cloud Blog cloud capacity update');
  assert.doesNotMatch(copy.title, /\bblueprint\b/i);
  assert.match(copy.deck, /cloud capacity/i);
});

test('generated card copy fails closed when no safe public title candidate exists', () => {
  const copy = generateCardCopy({
    id: 'unsafe-title-fixture',
    title: 'Extraction threshold routing decision',
    source: 'Relevance score',
    primary_category: 'Qualification',
    infrastructure_layer: 'qualification',
    public_content_tier: 'signal_card',
  });
  const result = cardCopyQualityResult(copy);

  assert.notEqual(copy.title, 'AI infrastructure update');
  assert.equal(result.ok, false);
  assert.ok(result.reasons.includes('missing_title'));
});

test('generated longform card copy falls back from persisted visible blueprint deck', () => {
  const copy = generateCardCopy({
    id: 'longform-blueprint-fixture',
    title: 'Grid capacity update',
    source: 'Example Source',
    publishedAt: '2026-05-22T00:00:00Z',
    public_content_tier: 'longform_analysis',
    articlePagePublished: true,
    deck: 'The source described a deployment blueprint for grid capacity planning with named operators and procurement timing.',
    why_it_matters: 'The grid update changes interconnection timing for AI campus delivery.',
    infrastructure_layer: 'grid',
  });
  const result = cardCopyQualityResult(copy);

  assert.equal(result.ok, true);
  assert.doesNotMatch(copy.deck, /\bblueprint\b/i);
  assert.match(copy.deck, /grid|interconnection|AI campus/i);
});

test('generated longform card copy cleans persisted why-it-matters prefixes', () => {
  const copy = generateCardCopy({
    type: 'longform_analysis',
    title: 'Power queue test',
    source: 'Test Source',
    category: 'Power',
    publicSignal: {
      why_it_matters: 'Why it matters: grid access is the delivery constraint for AI campus delivery.',
    },
  });
  const result = cardCopyQualityResult(copy);

  assert.equal(copy.why_it_matters, 'grid access is the delivery constraint for AI campus delivery.');
  assert.doesNotMatch(copy.why_it_matters, /^Why it matters:/i);
  assert.equal(result.ok, true);
});

test('generated card copy varies visible why-it-matters style across infrastructure angles', () => {
  const examples = [
    ['power', 'Utility queue delay hits a planned AI campus', 'Power & Grid', 'The utility identified a separate substation approval milestone for the campus.'],
    ['semiconductor', 'GPU supply window changes accelerator refresh timing', 'Semiconductors', 'The supplier identified a separate HBM qualification milestone for the accelerator.'],
    ['cloud', 'Cloud platform shift changes enterprise AI capacity planning', 'Cloud Capacity', 'The provider identified a separate regional availability milestone for the platform.'],
    ['capital', 'Infrastructure fund reprices data center capital raise', 'Capital Markets', 'The fund identified a separate financing close milestone for the data center.'],
  ].map(([layer, title, category, evidence]) => generateCardCopy({
    title,
    source: 'Test Source',
    summary: `${title} is the source-backed update under review.`,
    primary_category: category,
    infrastructure_layer: layer,
    cleaned_source_text: evidence,
    public_content_tier: 'editorial_brief',
  }));

  assert.equal(examples.every((copy) => !/^Why it matters:/i.test(copy.why_it_matters)), true);
  assert.ok(new Set(examples.map((copy) => copy.why_it_matters)).size > 1);
});

test('generated homepage copy avoids repeated fallback text across same-angle batches', () => {
  const sameAngleItems = Array.from({ length: 36 }, (_, index) => ({
    id: `silicon-feed-${index}`,
    title: `GPU supply window ${index + 1} changes accelerator rack planning`,
    source: index % 2 ? 'ServeTheHome' : 'HPCwire',
    sourceUrl: `https://example.com/silicon-feed-${index}`,
    publishedAt: new Date(Date.UTC(2026, 4, 20, index % 24)).toISOString(),
    primary_category: 'Semiconductors',
    infrastructure_layer: 'semiconductor',
    summary: `GPU accelerator and HBM memory supply update ${index + 1} affects data center buyers and refresh timing.`,
    articleText: `GPU accelerator and HBM memory supply update ${index + 1} affects data center buyers and refresh timing. The source identifies delivery window ${index + 1} as a separate shipment milestone for buyers. `.repeat(8),
    public_content_tier: 'signal_card',
    homepagePublished: true,
    archiveOnly: false,
    generatedImage: '/generated/fallbacks/semiconductors.svg',
  }));
  const authorized = authorizePublicTestRecords(sameAngleItems);
  const feed = buildHomepageFeed(authorized.records, { ...authorized.options, limit: 36, minimumVisible: 0 });
  const decks = feed.items.map((entry) => entry.publicSignal.deck);
  const whys = feed.items.map((entry) => entry.publicSignal.why_it_matters);

  assert.equal(feed.items.length, 36);
  assert.equal(maxDuplicateCount(decks), 1);
  assert.equal(maxDuplicateCount(whys), 1);
  assert.equal(feed.items.every((entry) => {
    const sequence = Number(entry.id.replace('silicon-feed-', '')) + 1;
    return entry.publicSignal.deck.includes(`update ${sequence}`)
      && entry.publicSignal.why_it_matters.includes(`window ${sequence}`);
  }), true, 'each fallback preserves its source-specific identifier');
  assert.doesNotMatch(`${decks.join(' ')} ${whys.join(' ')}`, /buyer queues|power budgets|interconnection dates|cloud margin pressure/i);
  assert.equal(feed.items.every((entry) => cardCopyQualityResult(entry.publicSignal).ok), true);
});

test('homepage preserves source-specific presentation decks and varies duplicate title prefixes', () => {
  const articles = [
    {
      id: 'chip-roundup-newer',
      title: 'Chip Industry Week in Review',
      source: 'Semiconductor Engineering',
      sourceUrl: 'https://example.com/chip-roundup-newer',
      publishedAt: '2026-08-07T07:01:09.000Z',
      primary_category: 'Semiconductors',
      infrastructure_layer: 'semiconductor',
      summary: 'H200 export controls, IC funding, equipment supply, and packaging pressure changed the chip supply outlook.',
      public_content_tier: 'signal_card',
      homepagePublished: true,
      generatedImage: '/generated/fallbacks/semiconductors.svg',
    },
    {
      id: 'chip-roundup-older',
      title: 'Chip Industry Week In Review',
      source: 'Semiconductor Engineering',
      sourceUrl: 'https://example.com/chip-roundup-older',
      publishedAt: '2026-07-24T07:01:00.000Z',
      primary_category: 'Semiconductors',
      infrastructure_layer: 'semiconductor',
      summary: 'Packaging constraints, equipment lead times, IC funding, and H200 policy shaped a separate weekly chip roundup.',
      public_content_tier: 'signal_card',
      homepagePublished: true,
      generatedImage: '/generated/fallbacks/semiconductors.svg',
    },
  ];

  const authorized = authorizePublicTestRecords(articles);
  const feed = buildHomepageFeed(authorized.records, { ...authorized.options, limit: 2, minimumVisible: 0 });
  const decks = feed.items.map((entry) => entry.publicSignal.deck);
  const prefixes = decks.map((deck) => deck.toLowerCase().split(/\s+/).slice(0, 8).join(' '));

  assert.equal(feed.items.length, 2);
  assert.match(decks[0], /H200 controls, IC funding, and packaging pressure/i);
  assert.equal(new Set(prefixes).size, 2);
});
