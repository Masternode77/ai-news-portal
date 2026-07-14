import assert from 'node:assert/strict';
import test from 'node:test';
import {
  cardCopyQualityResult,
  generateCardCopy,
} from '../scripts/lib/card-copy-quality-gate.mjs';
import { buildHomepageFeed } from '../scripts/lib/homepage-feed-builder.mjs';

function maxDuplicateCount(values = []) {
  const counts = new Map();
  for (const value of values) {
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  return Math.max(0, ...counts.values());
}

function terminalTailFamily(value = '') {
  return String(value)
    .toLowerCase()
    .replace(/[^\w\s-]/g, ' ')
    .replace(/\b\d+\b/g, '#')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .slice(-9)
    .join(' ');
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

test('card copy gate rejects the observed legacy decision templates', () => {
  const templates = [
    'The project ties AI buildout timing to power procurement, utility capacity, and energy-contract risk.',
    'The source names a grid constraint; the practical checkpoint is substation delivery.',
    'The facility has a dated opening; the exposed dependency is utility energization.',
  ];

  for (const deck of templates) {
    const result = cardCopyQualityResult({
      title: 'AI data center delivery update',
      deck,
      why_it_matters: 'The source identifies a concrete power and data center decision.',
      source: 'Example Source',
    });

    assert.equal(result.ok, false, deck);
    assert.ok(result.reasons.includes('public_template_phrase'), deck);
  }
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
    contentText: 'A named utility delayed interconnection for a planned data center campus.',
    public_content_tier: 'editorial_brief',
  });
  const result = cardCopyQualityResult(copy);

  assert.equal(result.ok, true);
  assert.equal(copy.label, 'Brief');
  assert.equal(copy.cta, 'Read brief');
  assert.match(copy.deck, /(utility|power|campus|data center|interconnection)/i);
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

test('generated source-signal copy uses extracted source text instead of persisted legacy templates', () => {
  const sourceSentence = 'Rapidus is targeting 2nm mass production at its Hokkaido fab in 2027 while it works to convert potential customers into committed volume.';
  const copy = generateCardCopy({
    id: 'source-grounded-signal',
    title: 'Rapidus sets a 2027 target for Hokkaido 2nm production',
    source: 'Example Source',
    sourceUrl: 'https://example.com/rapidus',
    primary_category: 'Semiconductors',
    infrastructure_layer: 'semiconductor',
    public_content_tier: 'signal_card',
    summary: 'Rapidus ties AI buildout timing to accelerator supply; the practical checkpoint is customer conversion.',
    deck: 'Rapidus ties AI buildout timing to accelerator supply; the practical checkpoint is customer conversion.',
    contentText: `${sourceSentence} A pilot line began processing wafers last year.`,
  });

  assert.equal(copy.deck, sourceSentence);
  assert.equal(copy.why_it_matters, '');
  assert.equal(cardCopyQualityResult(copy).ok, true);
});

test('source-signal copy rejects synthetic source fields when no source-grounded sentence remains', () => {
  const synthetic = 'Qumulo Introduces Cloud AI Accelerator matters most for capacity-per-watt planning, supplier leverage, and the timing of AI hardware refresh cycles.';
  const copy = generateCardCopy({
    id: 'synthetic-source-signal',
    title: 'Qumulo Introduces Cloud AI Accelerator',
    source: 'Example Source',
    sourceUrl: 'https://example.com/qumulo',
    primary_category: 'Cloud Capacity',
    infrastructure_layer: 'cloud',
    public_content_tier: 'signal_card',
    contentText: synthetic.repeat(5),
    articleText: synthetic.repeat(5),
    summary: synthetic,
  });

  assert.equal(copy.deck, '');
  assert.equal(cardCopyQualityResult(copy).ok, false);

  const decisionPoint = generateCardCopy({
    id: 'synthetic-decision-point',
    title: 'AWS memory pricing changes cloud adoption',
    source: 'Example Source',
    primary_category: 'Cloud Capacity',
    infrastructure_layer: 'cloud',
    public_content_tier: 'signal_card',
    contentText: 'AWS turns power into a memory economics decision point for capacity planners.',
  });
  assert.equal(decisionPoint.deck, '');
});

test('source-signal copy rejects attribution scaffolding that only repeats the title', () => {
  const title = 'NetApp Expands OpenShift Data Management With Faster VM Backup';
  const copy = generateCardCopy({
    id: 'reported-title-only',
    title,
    source: 'StorageReview',
    sourceUrl: 'https://example.com/netapp',
    primary_category: 'Cloud Capacity',
    infrastructure_layer: 'storage',
    public_content_tier: 'signal_card',
    contentText: `StorageReview reported: ${title}.`,
  });

  assert.equal(copy.deck, '');
  assert.equal(cardCopyQualityResult(copy).ok, false);
});

test('source-signal copy preserves a substantive reported fact', () => {
  const copy = generateCardCopy({
    id: 'reported-source-fact',
    title: 'Utility study moves campus energization into 2028',
    source: 'Example Grid Dispatch',
    sourceUrl: 'https://example.com/grid-study',
    primary_category: 'Power & Grid',
    infrastructure_layer: 'grid',
    public_content_tier: 'signal_card',
    contentText: 'The utility reported: transformer delivery and substation construction now move the planned AI data center campus energization date into 2028.',
  });

  assert.match(copy.deck, /transformer delivery and substation construction/);
  assert.equal(cardCopyQualityResult(copy).ok, true);
});

test('source-signal copy keeps initials and company abbreviations inside one sentence', () => {
  const copy = generateCardCopy({
    title: 'TSMC CEO C.C. Wei says capacity will remain tight',
    source: "Tom's Hardware",
    sourceUrl: 'https://example.com/tsmc-capacity',
    primary_category: 'Semiconductors',
    infrastructure_layer: 'foundry',
    public_content_tier: 'signal_card',
    contentText: 'TSMC says it lacks enough capacity for AI hyperscaler demand, with CEO C.C. Wei saying it will take a long time to match customer demand.',
  });

  assert.match(copy.deck, /CEO C\.C\. Wei saying it will take a long time/);
  assert.doesNotMatch(copy.deck, /CEO C\.C\.$/);
});

test('source-signal copy rejects title fragments and generated attribution scaffolding', () => {
  const title = 'Peterson Co. plots three-building data center campus in Leesburg, Virginia';
  const copy = generateCardCopy({
    title,
    source: 'Data Center Dynamics',
    sourceUrl: 'https://example.com/peterson-campus',
    primary_category: 'Data Centers',
    infrastructure_layer: 'data center',
    public_content_tier: 'signal_card',
    cleaned_source_text: `Data Center Dynamics reported: ${title}. plots three-building data center campus in Leesburg, Virginia connects to data center facility decisions tracked by Compute Current. Data Center Dynamics names Peterson Co, Leesburg, Virginia as relevant actors or entities. plots three-building data center campus in Leesburg, Virginia.`,
  });

  assert.equal(copy.deck, '');
  assert.equal(cardCopyQualityResult(copy).ok, false);
});

test('source-signal copy skips lowercase extraction fragments and uses the next complete sentence', () => {
  const copy = generateCardCopy({
    title: '365 Data Centers and Aphorio Carter plan a 200 MW expansion',
    source: 'Example Infrastructure Dispatch',
    sourceUrl: 'https://example.com/365-data-centers-expansion',
    primary_category: 'Data Centers',
    infrastructure_layer: 'data center',
    public_content_tier: 'signal_card',
    cleaned_source_text: 'sites, transforming existing assets into high-density hubs for next-gen computing workloads. The companies plan to develop 200 MW of data center capacity across several U.S. markets.',
  });

  assert.equal(copy.deck, 'The companies plan to develop 200 MW of data center capacity across several U.S. markets.');
  assert.equal(cardCopyQualityResult(copy).ok, true);
});

test('source-signal copy does not treat a feed snippet as extracted source evidence', () => {
  const copy = generateCardCopy({
    title: 'Utility filing moves a data center campus into 2028',
    source: 'Example Feed',
    sourceUrl: 'https://example.com/feed-only',
    primary_category: 'Power & Grid',
    infrastructure_layer: 'grid',
    public_content_tier: 'signal_card',
    snippet: 'A utility filing says substation delivery moves the planned data center campus energization date into 2028.',
  });

  assert.equal(copy.deck, '');
});

test('card copy gate accepts British data centre spelling', () => {
  const result = cardCopyQualityResult({
    title: 'Scotland updates planning rules for data centres',
    deck: 'The policy gives Scottish data centre developers a new planning route for grid-connected campuses and utility upgrades.',
    why_it_matters: '',
    source: 'Example Source',
  });

  assert.equal(result.ok, true);
});

test('source-signal copy tolerates malformed numeric entities from untrusted source text', () => {
  const copy = generateCardCopy({
    id: 'malformed-source-entity',
    title: 'Utility filing sets a campus energization date',
    source: 'Example Source',
    sourceUrl: 'https://example.com/utility-filing',
    primary_category: 'Power & Grid',
    infrastructure_layer: 'grid',
    public_content_tier: 'signal_card',
    contentText: 'The utility filing identifies &#999999999999; a 2028 substation delivery date for the planned AI data center campus.',
  });

  assert.match(copy.deck, /2028 substation delivery date/);
  assert.equal(cardCopyQualityResult(copy).ok, true);
});

test('source-signal copy does not treat generated article text or summaries as source evidence', () => {
  const generatedSentence = 'The proposed AI data center campus would make utility power delivery the decisive capacity constraint for operators.';
  const copy = generateCardCopy({
    id: 'generated-copy-only',
    title: 'Campus proposal awaits utility power delivery',
    source: 'Example Source',
    sourceUrl: 'https://example.com/campus-proposal',
    primary_category: 'Power & Grid',
    infrastructure_layer: 'power',
    public_content_tier: 'signal_card',
    contentText: '',
    extractedText: '',
    sourceText: '',
    rawText: '',
    snippet: '',
    articleText: generatedSentence,
    summary: generatedSentence,
  });

  assert.equal(copy.deck, '');
  assert.equal(cardCopyQualityResult(copy).ok, false);
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
    contentText: 'Google Cloud describes a public-sector cloud capacity update with named platform architecture and deployment requirements.',
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
    contentText: 'A utility filing identifies the substation delivery date that controls commissioning for the planned AI data center campus.',
  });
  const result = cardCopyQualityResult(copy);

  assert.equal(result.ok, true);
  assert.doesNotMatch(copy.deck, /\bblueprint\b/i);
  assert.match(copy.deck, /grid|interconnection|substation|AI data center campus/i);
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
    deck: 'A utility filing identifies the grid access milestone required before the planned AI data center campus can begin commissioning.',
  });
  const result = cardCopyQualityResult(copy);

  assert.equal(copy.why_it_matters, 'grid access is the delivery constraint for AI campus delivery.');
  assert.doesNotMatch(copy.why_it_matters, /^Why it matters:/i);
  assert.equal(result.ok, true);
});

test('generated source-only card copy does not fabricate why-it-matters text across infrastructure angles', () => {
  const examples = [
    ['power', 'Utility queue delay hits a planned AI campus', 'Power & Grid'],
    ['semiconductor', 'GPU supply window changes accelerator refresh timing', 'Semiconductors'],
    ['cloud', 'Cloud platform shift changes enterprise AI capacity planning', 'Cloud Capacity'],
    ['capital', 'Infrastructure fund reprices data center capital raise', 'Capital Markets'],
  ].map(([layer, title, category]) => generateCardCopy({
    title,
    source: 'Test Source',
    primary_category: category,
    infrastructure_layer: layer,
    public_content_tier: 'editorial_brief',
  }));

  assert.equal(examples.every((copy) => !/^Why it matters:/i.test(copy.why_it_matters)), true);
  assert.equal(examples.every((copy) => copy.why_it_matters === ''), true);
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
    contentText: `GPU accelerator and HBM memory supply update ${index + 1} affects data center buyers and refresh timing.`,
    public_content_tier: 'signal_card',
    homepagePublished: true,
    archiveOnly: false,
    generatedImage: '/generated/fallbacks/semiconductors.svg',
  }));
  const feed = buildHomepageFeed(sameAngleItems, { limit: 36, minimumVisible: 0 });
  const titles = feed.items.map((entry) => entry.publicSignal.title);
  const decks = feed.items.map((entry) => entry.publicSignal.deck);
  const whys = feed.items.map((entry) => entry.publicSignal.why_it_matters);

  assert.equal(feed.items.length, 36);
  assert.equal(maxDuplicateCount(titles), 1);
  assert.equal(decks.every(Boolean), true);
  assert.equal(maxDuplicateCount(decks), 1);
  assert.equal(whys.every((why) => why === ''), true);
  assert.doesNotMatch(JSON.stringify(feed.items), /compact signal|infrastructure readers|why it matters:/i);
});
