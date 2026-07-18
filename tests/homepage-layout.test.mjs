import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { buildArchiveFeed } from '../scripts/lib/archive-feed-builder.mjs';
import { inferBottleneckAxis } from '../scripts/lib/bottleneck-axis-diversity.mjs';
import { buildHomepageFeed } from '../scripts/lib/homepage-feed-builder.mjs';
import { findInternalLanguageHits } from '../scripts/lib/internal-language-guard.mjs';
import { generateLongformAnalysis } from '../scripts/lib/longform-engine.mjs';

function item(index, tier = 'editorial_brief') {
  const sourceSentence = `A utility filing documents a concrete ${index % 2 ? 'power' : 'data center'} constraint for AI infrastructure buyers.`;
  return {
    id: `item-${index}`,
    title: `AI infrastructure item ${index}`,
    source: index % 2 ? 'Utility Dive' : 'Data Center Dynamics',
    sourceUrl: `https://example.com/infrastructure-item-${index}`,
    publishedAt: new Date(Date.UTC(2026, 4, 20, index % 24)).toISOString(),
    primary_category: index % 2 ? 'Power & Grid' : 'Data Centers',
    infrastructure_layer: index % 2 ? 'power' : 'data center facility',
    public_content_tier: tier,
    homepagePublished: true,
    archiveOnly: false,
    seo_noindex: false,
    contentText: sourceSentence,
    snippet: sourceSentence,
    deck: `A concrete ${index % 2 ? 'power' : 'data center'} constraint changes capacity planning for AI infrastructure buyers.`,
  };
}

function withPassedEditorialGates(article = {}) {
  return {
    ...article,
    source_fidelity: { ok: true },
    claim_fidelity: { ok: true, unsupportedClaims: [] },
    seo_fidelity: { ok: true },
  };
}

function qualityLongform(index, overrides = {}) {
  const articleText = 'A utility filing ties a contracted AI campus to substation delivery, transformer procurement, cooling completion, customer fit-out, financing, and a dated energization milestone. '.repeat(12);
  return withPassedEditorialGates(generateLongformAnalysis({
    ...item(index),
    articleText,
    rawText: articleText,
    extraction_quality_score: 0.95,
    infrastructure_relevance_score: 0.9,
    ...overrides,
  }));
}

function axisItem(index, axis, hoursAgo = index) {
  const byAxis = {
    capacity: {
      title: 'Hyperscaler lease turns into live data center capacity',
      primary_category: 'Data Centers',
      infrastructure_layer: 'data center facility',
      deck: 'A named lease changes where AI demand becomes usable data center capacity for buyers.',
    },
    power: {
      title: 'Utility interconnection queue delays AI campus energization',
      primary_category: 'Power & Grid',
      infrastructure_layer: 'power',
      deck: 'A grid queue delay changes energization timing for AI campus operators.',
    },
    capital: {
      title: 'Infrastructure fund prices new data center capital raise',
      primary_category: 'Capital Markets',
      infrastructure_layer: 'capital',
      deck: 'A capital raise shows which AI infrastructure risk investors still underwrite.',
    },
    'supply-chain': {
      title: 'Transformer supplier backlog shifts AI campus delivery dates',
      primary_category: 'Supply Chain',
      infrastructure_layer: 'equipment supply',
      deck: 'A supplier backlog changes delivery timing for substations and AI capacity commitments.',
    },
    risk: {
      title: 'Local permitting challenge raises data center siting risk',
      primary_category: 'Policy & Siting',
      infrastructure_layer: 'risk',
      deck: 'A permitting challenge changes the exposure profile for data center developers.',
    },
  };
  return {
    ...item(index),
    ...byAxis[axis],
    contentText: byAxis[axis].deck,
    id: `axis-${axis}-${index}`,
    infrastructure_relevance_score: 0.9,
    publishedAt: new Date(Date.UTC(2026, 4, 20, 12 - hoursAgo)).toISOString(),
    bottleneck_type: axis,
    generatedImage: `/generated/fallbacks/${axis === 'supply-chain' ? 'supply-chain' : axis === 'capacity' ? 'data-centers' : axis === 'risk' ? 'regulation' : axis}.svg`,
  };
}

function weakGeneralAiItem(index, title) {
  return {
    id: `weak-general-ai-${index}`,
    title,
    source: 'Bloomberg Technology',
    sourceUrl: `https://example.com/weak-general-ai-${index}`,
    publishedAt: new Date(Date.UTC(2026, 4, 21, index)).toISOString(),
    primary_category: 'AI Infrastructure',
    infrastructure_layer: 'Compute',
    infrastructure_relevance_score: 0.62,
    public_content_tier: 'signal_card',
    homepagePublished: true,
    archiveOnly: false,
    seo_noindex: false,
    summary: `${title} remains a source-linked AI infrastructure signal.`,
    articleText: `${title} remains a source-linked AI infrastructure signal.`,
    generatedImage: '/generated/fallbacks/ai-infrastructure.svg',
  };
}

test('homepage feed exposes 30 to 50 public cards when enough eligible items exist', () => {
  const feed = buildHomepageFeed(Array.from({ length: 36 }, (_, index) => item(index)));

  assert.equal(feed.items.length, 36);
  assert.ok(feed.featured.publicSignal.title);
  assert.equal(feed.featured.publicSignal.title, feed.items[0].publicSignal.title);
  assert.equal(feed.items.every((entry) => entry.publicSignal.title), true);
  assert.equal(feed.sections.length, 1);
  assert.equal(feed.sections[0].title, 'Latest Analysis');
});

test('homepage feed backfills past newer cards that fail public copy quality', () => {
  const invalid = Array.from({ length: 3 }, (_, index) => ({
    ...item(index + 900),
    publishedAt: new Date(Date.UTC(2026, 5, 1, 12 - index)).toISOString(),
    contentText: '',
    extractedText: '',
    sourceText: '',
    rawText: '',
    snippet: '',
    infrastructure_relevance_score: 0.9,
  }));
  const valid = Array.from({ length: 3 }, (_, index) => ({
    ...item(index + 910),
    publishedAt: new Date(Date.UTC(2026, 4, 31, 12 - index)).toISOString(),
  }));

  const feed = buildHomepageFeed([...invalid, ...valid], { limit: 3, minimumVisible: 0 });

  assert.equal(feed.items.length, 3);
  assert.deepEqual(feed.items.map((entry) => entry.id).sort(), valid.map((entry) => entry.id).sort());
});

test('archive pagination counts only cards that can be rendered', () => {
  const invalid = {
    ...item(920),
    publishedAt: '2026-06-01T12:00:00.000Z',
    contentText: '',
    extractedText: '',
    sourceText: '',
    rawText: '',
    snippet: '',
    infrastructure_relevance_score: 0.9,
  };
  const valid = Array.from({ length: 3 }, (_, index) => ({
    ...item(index + 930),
    publishedAt: new Date(Date.UTC(2026, 4, 31, 12 - index)).toISOString(),
  }));

  const feed = buildArchiveFeed([invalid, ...valid], { page: 1, pageSize: 2 });

  assert.equal(feed.total, 3);
  assert.equal(feed.pageCount, 2);
  assert.equal(feed.items.length, 2);
  assert.equal(feed.items.some((entry) => entry.id === invalid.id), false);
});

test('homepage feed never renders an unsafe source URL', () => {
  const unsafe = {
    ...item(999, 'signal_card'),
    sourceUrl: 'javascript:alert(1)',
    url: 'javascript:alert(2)',
    articlePagePublished: false,
    signalCardOnly: true,
  };
  const feed = buildHomepageFeed([unsafe], { limit: 1, minimumVisible: 0 });

  assert.equal(feed.items.length, 0);
  assert.equal(feed.featured, null);
});

test('homepage feed reserves a slot only for a fresh quality longform outside the newest card window', () => {
  const articleText = 'A utility filing ties a contracted AI campus to substation delivery, transformer procurement, cooling completion, customer fit-out, financing, and a dated energization milestone. '.repeat(12);
  const longform = withPassedEditorialGates(generateLongformAnalysis({
    id: 'older-quality-analysis',
    title: 'A contracted campus moves from demand risk to delivery risk',
    source: 'Infrastructure Filing',
    sourceUrl: 'https://example.com/older-quality-analysis',
    publishedAt: '2026-05-19T22:00:00Z',
    primary_category: 'Power & Grid',
    infrastructure_layer: 'power',
    extraction_quality_score: 0.95,
    infrastructure_relevance_score: 0.9,
    articleText,
    rawText: articleText,
    summary: 'A contracted campus still depends on utility and construction milestones.',
  }));
  const recentBriefs = Array.from({ length: 60 }, (_, index) => ({
    ...item(index + 200),
    publishedAt: new Date(Date.UTC(2026, 4, 20, 23, 59 - index)).toISOString(),
  }));

  const feed = buildHomepageFeed([...recentBriefs, longform], { limit: 50, minimumVisible: 30 });

  assert.equal(feed.items.length, 50);
  assert.equal(feed.items.some((entry) => entry.id === longform.id), true);
  assert.ok(feed.items.findIndex((entry) => entry.id === longform.id) >= 5);
});

test('homepage feed does not promote a stale longform into Latest Analysis', () => {
  const articleText = 'A utility filing ties a contracted AI campus to substation delivery, transformer procurement, cooling completion, customer fit-out, financing, and a dated energization milestone. '.repeat(12);
  const stale = generateLongformAnalysis({
    id: 'stale-quality-analysis',
    title: 'An old contracted campus analysis remains available in the archive',
    source: 'Infrastructure Filing',
    sourceUrl: 'https://example.com/stale-quality-analysis',
    publishedAt: '2026-03-01T00:00:00Z',
    primary_category: 'Power & Grid',
    infrastructure_layer: 'power',
    extraction_quality_score: 0.95,
    infrastructure_relevance_score: 0.9,
    articleText,
    rawText: articleText,
  });
  const recentBriefs = Array.from({ length: 20 }, (_, index) => ({
    ...item(index + 300),
    publishedAt: new Date(Date.UTC(2026, 4, 20, 23, 59 - index)).toISOString(),
  }));
  Object.assign(stale, withPassedEditorialGates(stale));
  const feed = buildHomepageFeed([...recentBriefs, stale], { limit: 50, minimumVisible: 30 });
  const archive = buildArchiveFeed([...recentBriefs, stale], { page: 1, pageSize: 50 });
  assert.equal(feed.items.some((entry) => entry.id === stale.id), false);
  assert.equal(archive.items.some((entry) => entry.id === stale.id), true);
});

test('homepage and archive feeds exclude weak general AI items without dropping below 30 cards', () => {
  const weakTitles = ['AI Is Reshaping Self-Driving Cars, Wayve CEO Says', 'Vibe coding is spreading, but engineering is not going away', 'Orlando Bravo Says Thoma Bravo Has Become AI-Centric'];
  const articles = [
    ...weakTitles.map((title, index) => weakGeneralAiItem(index, title)),
    ...Array.from({ length: 36 }, (_, index) => item(index + 100)),
  ];
  const homepage = buildHomepageFeed(articles, { limit: 50, minimumVisible: 30 });
  const archive = buildArchiveFeed(articles, { page: 1, pageSize: 50 });
  const homepageText = JSON.stringify(homepage.items.map((entry) => entry.publicSignal));
  const archiveText = JSON.stringify(archive.items.map((entry) => entry.publicSignal));

  assert.equal(homepage.items.length, 36);
  assert.equal(archive.items.length, 36);
  for (const title of weakTitles) {
    assert.doesNotMatch(homepageText, new RegExp(title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
    assert.doesNotMatch(archiveText, new RegExp(title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
  }
});

test('homepage first viewport cards represent distinct bottleneck axes when eligible signals exist', () => {
  const feed = buildHomepageFeed([
    ...Array.from({ length: 5 }, (_, index) => axisItem(index + 50, 'power', index)),
    axisItem(1, 'capacity', 8),
    axisItem(2, 'capital', 9),
    axisItem(3, 'supply-chain', 10),
    axisItem(4, 'risk', 11),
  ], { limit: 9, minimumVisible: 0 });
  const firstViewportAxes = feed.items.slice(0, 5).map((entry) => entry.publicSignal.bottleneck_axis);

  assert.deepEqual(firstViewportAxes, ['power', 'capacity', 'capital', 'supply-chain', 'risk']);
  assert.equal(new Set(feed.items.slice(0, 5).map((entry) => entry.publicSignal.title)).size, 5);
});

test('editorial category wins over a stale persisted bottleneck axis', () => {
  assert.equal(inferBottleneckAxis({
    title: 'Leading-edge fab capacity expands',
    primary_category: 'Semiconductors',
    infrastructure_layer: 'Silicon',
    bottleneck_type: 'power_grid',
  }), 'capacity');
});

test('clear title evidence repairs stale category metadata for risk and supply-chain stories', () => {
  assert.equal(inferBottleneckAxis({
    title: 'Counties pass temporary data center bans',
    primary_category: 'Power & Grid',
  }), 'risk');
  assert.equal(inferBottleneckAxis({
    title: 'Liquid-cooling supplier unveils an 800V DC busbar',
    primary_category: 'Cooling',
  }), 'supply-chain');
});

test('homepage diversity does not promote stale axes ahead of the recent candidate window', () => {
  const recent = Array.from({ length: 15 }, (_, index) => axisItem(index + 100, index % 2 ? 'capacity' : 'power', index));
  const staleCapital = axisItem(999, 'capital', 30);
  const feed = buildHomepageFeed([...recent, staleCapital], { limit: 16, minimumVisible: 0 });

  assert.equal(feed.items.slice(0, 5).some((entry) => entry.id === staleCapital.id), false);
  assert.equal(feed.items.at(-1).id, staleCapital.id);
});

test('homepage feed mixes longform and short public items without internal buckets', () => {
  const feed = buildHomepageFeed([
    qualityLongform(1),
    item(2, 'editorial_brief'),
    item(3, 'signal_card'),
    { ...item(4, 'hidden'), homepagePublished: false, archiveOnly: true },
  ]);
  const labels = feed.items.map((entry) => entry.publicSignal.signal_label);

  assert.deepEqual(labels.sort(), ['Analysis', 'Brief', 'Signal'].sort());
  assert.equal(feed.items.some((entry) => /Signals being monitored|Published deskwork|Cycle status/i.test(JSON.stringify(entry))), false);
});

test('homepage feed avoids visible standalone blueprint without mutating source URLs', () => {
  const article = {
    id: 'watch_sig_299b3d10a524a4cb',
    title: 'Google: Architecting the blueprint for AI data center capacity',
    deck: 'Google: Architecting the blueprint for AI data center capacity remains a source-linked AI infrastructure signal.',
    why_it_matters: 'Google: Architecting the blueprint for AI data center capacity remains a source-linked AI infrastructure signal.',
    source: 'Google Cloud Blog',
    sourceUrl: 'https://cloud.google.com/blog/topics/infrastructure/architecting-the-blueprint-for-ai-data-center-capacity/',
    publishedAt: new Date(Date.UTC(2026, 4, 20, 12)).toISOString(),
    primary_category: 'Cloud Capacity',
    infrastructure_layer: 'cloud capacity',
    infrastructure_relevance_score: 0.62,
    public_content_tier: 'signal_card',
    homepagePublished: true,
    archiveOnly: false,
    generatedImage: '/generated/fallbacks/cloud-capacity.svg',
    snippet: 'Google describes the systems and capacity planning behind its AI data center architecture.',
    contentText: 'Google describes the systems and capacity planning behind its AI data center architecture.',
    public_presentation: {
      image_alt: 'Google: Architecting the blueprint for AI data center capacity editorial visual',
    },
  };
  const feed = buildHomepageFeed([article], { limit: 1, minimumVisible: 0 });
  const signal = feed.items[0].publicSignal;
  const signalText = JSON.stringify({
    title: signal.title,
    deck: signal.deck,
    why_it_matters: signal.why_it_matters,
    image_alt: signal.image_alt,
    source: signal.source,
    cta: signal.cta,
  });
  const hits = findInternalLanguageHits([{ path: '/', surface: 'test-feed', text: signalText }]);

  assert.equal(feed.items.length, 1);
  assert.equal(feed.featured.id, 'watch_sig_299b3d10a524a4cb');
  assert.equal(feed.sections[0].items.length, 1);
  assert.equal(signal.title, 'Google Cloud Blog cloud capacity update');
  assert.equal(signal.image_alt, 'Google Cloud Blog cloud capacity update editorial visual');
  assert.equal(/\bblueprint\b/i.test(signalText), false);
  assert.equal(signal.read_source, article.sourceUrl);
  assert.match(signal.read_source, /\bblueprint\b/i);
  assert.doesNotMatch(signal.image, /\bblueprint\b/i);
  assert.equal(signal.image_variant, 'thumbnail');
  assert.equal(typeof signal.image_provenance_label, 'string');
  assert.notEqual(signal.image_provenance_label.length, 0);
  assert.equal(signal.image_provenance_kind, 'fallback');
  assert.doesNotMatch(signalText, /ChatGPT Image2 visual|Editorial visual|Original source image/);
  assert.deepEqual(hits, []);
});

test('homepage feed keeps longform count while replacing persisted blueprint deck', () => {
  const article = qualityLongform(88, {
    id: 'longform-blueprint-fixture',
    title: 'Grid capacity update',
    source: 'Example Source',
    sourceUrl: 'https://example.com/longform-blueprint',
    publishedAt: '2026-05-22T00:00:00Z',
    deck: 'The source described a deployment blueprint for grid capacity planning with named operators and procurement timing.',
    why_it_matters: 'The grid update changes interconnection timing for AI campus delivery.',
    infrastructure_layer: 'grid',
  });
  const feed = buildHomepageFeed([article], { limit: 1, minimumVisible: 0 });
  const signal = feed.items[0].publicSignal;
  const publicText = JSON.stringify({
    title: signal.title,
    deck: signal.deck,
    why_it_matters: signal.why_it_matters,
    source: signal.source,
    cta: signal.cta,
  });
  const hits = findInternalLanguageHits([{ path: '/', surface: 'test-feed', text: publicText }]);

  assert.equal(feed.items.length, 1);
  assert.equal(feed.sections[0].items.length, 1);
  assert.doesNotMatch(signal.deck, /\bblueprint\b/i);
  assert.match(signal.deck, /grid|interconnection|AI campus/i);
  assert.deepEqual(hits, []);
});

test('homepage feed only links to article detail pages that pass public longform eligibility', () => {
  const feed = buildHomepageFeed([
    {
      ...item(7, 'longform_analysis'),
      articlePagePublished: true,
      sourceUrl: 'https://example.com/source-story',
      expertLensFull: { finalArticleBody: 'Too short for a public article page.' },
    },
  ]);

  assert.equal(feed.items.length, 0);
});

test('homepage cards use a stable publication list layout', () => {
  const cardSource = fs.readFileSync('src/components/ArticleCard.astro', 'utf8');
  const styles = fs.readFileSync('src/styles/public-intelligence.css', 'utf8');

  assert.match(styles, /\.public-site \.article-list\s*{[^}]*grid-template-columns:\s*1fr/s);
  assert.match(styles, /\.public-site \.article-list-card\s*{[^}]*grid-template-columns:\s*240px minmax\(0, 1fr\)/s);
  assert.match(cardSource, /article-impact-pills/);
  assert.match(cardSource, /format_label/);
  assert.equal(/Cycle status|qualifying signal|Published deskwork/i.test(cardSource), false);
});

test('homepage composes dedicated publication components', () => {
  const source = fs.readFileSync('src/pages/index.astro', 'utf8');
  const feedSource = fs.readFileSync('src/components/LatestAnalysisFeed.astro', 'utf8');
  const styles = fs.readFileSync('src/styles/public-intelligence.css', 'utf8');

  assert.match(source, /PublicSiteHeader/);
  assert.match(source, /PublicSiteFooter/);
  assert.match(source, /public-lead/);
  assert.match(source, /Latest intelligence/);
  assert.match(source, /Explore the archive/);
  assert.match(source, /Browse all coverage/);
  assert.doesNotMatch(source, /Latest Signals|Infrastructure command center|public operating board|Source Signal/i);
  assert.match(feedSource, /ArticleCard/);
  assert.match(styles, /\.public-lead\s*{/);
  assert.match(styles, /\.public-decision-index\s*{/);
  assert.match(styles, /\.public-discovery\s*{/);
});
