import assert from 'node:assert/strict';
import test from 'node:test';
import Parser from 'rss-parser';
import {
  httpsItemUrl,
  hydrateSourceTextScope,
  parseFeedItem,
  publishedAtIso,
  refreshCachedRelevance,
  repairFeedLink,
  selectPoolItems,
  textValue,
} from '../scripts/lib/fetch-feeds.mjs';
import { authorizedTextFallbackPool, columnCandidateRecords } from '../scripts/pipeline.mjs';
import { abstractOnlySource, selectColumnStory } from '../scripts/lib/authored-column-engine.mjs';
import { abstractOnlyCluster, proceduralDocketCluster, selectEditorialSignals } from '../scripts/lib/editorial-selection-engine.mjs';
import { cleanScanItem, scanSourceItems } from '../scripts/lib/global-source-scan.mjs';
import { definitivelyArchived, rollingCandidates } from '../scripts/lib/curate.mjs';
import { isPublicProductFit, publicProductFitResult } from '../scripts/lib/public-product-fit.mjs';
import { buildHomepageFeed } from '../scripts/lib/homepage-feed-builder.mjs';
import { createExtractionArtifact } from '../scripts/lib/extraction-artifact.mjs';
import { applyPublicRouting, routeStrictInfrastructureRelevance } from '../scripts/lib/strict-infrastructure-relevance-router.mjs';
import { canGenerateFullArticle } from '../scripts/lib/editorial-story-engine-v2.mjs';
import { abstractOnlyTextScope } from '../scripts/lib/source-registry.mjs';
import { fixtureArticle } from './fixtures/authored-column-fixture.mjs';
import { classifyInfrastructureRelevance, proceduralDocketWithoutComputeContext } from '../scripts/lib/relevance-classifier.mjs';
import { applyPublicContentTier } from '../scripts/lib/public-content-tier-router.mjs';
import { ecPresscornerApiTarget, fetchArticleExtraction } from '../scripts/lib/source-fetch.mjs';
import { activeRegistryFeeds, loadSourceRegistry } from '../scripts/lib/source-registry.mjs';
import { sourceTextTargetDecision } from '../scripts/lib/source-text-fetcher.mjs';

const NOW = new Date('2026-09-10T12:00:00.000Z');
const PUBLIC_ADDRESS = [{ address: '93.184.216.34', family: 4 }];

function bodyResponse(contentType, text) {
  return {
    status: 200,
    headers: { 'content-type': contentType },
    body: {
      async *[Symbol.asyncIterator]() {
        yield Buffer.from(text);
      },
    },
    destroy() {},
  };
}

function htmlResponse(html) {
  return bodyResponse('text/html; charset=utf-8', html);
}

function authorizedSource(id, domain, extra = {}) {
  return {
    id,
    name: id,
    domain,
    feed: `https://${domain}/feed`,
    status: 'active_feed',
    text_use_basis: 'licensed',
    image_use_basis: 'unreviewed',
    terms_url: `https://${domain}/terms`,
    reviewed_at: '2026-09-01',
    allow_text_use: true,
    allow_image_reuse: false,
    ...extra,
  };
}

async function extractWith(source, url, html) {
  return fetchArticleExtraction({
    url,
    title: 'Fixture title',
    fallbackSnippet: 'Fixture snippet.',
    sourceRegistryId: source.id,
    sources: [source],
    now: NOW,
    networkOptions: {
      resolveHost: async () => PUBLIC_ADDRESS,
      request: async () => htmlResponse(html),
    },
  });
}

test('Drupal feeds that ship an escaped anchor tag as the link resolve to the article page', () => {
  // Given: the ACER feed item as the runner saw it on 2026-09-10.
  const feed = {
    sourceRegistryId: 'acer-news',
    source: 'ACER',
    url: 'https://www.acer.europa.eu/rss.xml',
    region: 'EU',
    language: 'en',
    defaultCategory: 'Power & Grid',
  };
  const item = parseFeedItem(feed, {
    title: 'ACER calls for better market modelling as data centre demand outpaces electricity supply in Portugal',
    link: 'https://www.acer.europa.eu/%3Ca%20href%3D%22/news/acer-calls-better-market-modelling%22%20hreflang%3D%22en%22%3EACER%20calls%3C/a%3E',
    pubDate: 'Mon, 09/07/2026 - 08:13',
    contentSnippet: 'Data centre demand in Portugal is growing faster than supply.',
  }, NOW);

  // Then: the link points at the article and the Drupal date is a real timestamp.
  assert.equal(item.url, 'https://www.acer.europa.eu/news/acer-calls-better-market-modelling');
  assert.equal(item.publishedAt, '2026-09-07T08:13:00.000Z');
  assert.equal(repairFeedLink('https://arxiv.org/abs/2609.09160', 'https://rss.arxiv.org/rss/cs.DC'), 'https://arxiv.org/abs/2609.09160');
});

test('a feed that wraps item titles in markup still parses instead of failing the feed', async () => {
  // Given: the ACER feed as rss-parser sees it — the title element contains an anchor, so
  // xml2js returns an object, which previously threw "(item.title || '').trim is not a function".
  const xml = `<?xml version="1.0" encoding="utf-8"?><rss version="2.0"><channel><title>www.acer.europa.eu</title><link>https://www.acer.europa.eu/</link><description></description>
<item><title><a href="/news/acer-calls-better-market-modelling" hreflang="en">ACER calls for better market modelling as data centre demand outpaces electricity supply in Portugal</a></title><link>https://www.acer.europa.eu/%3Ca%20href%3D%22/news/acer-calls-better-market-modelling%22%20hreflang%3D%22en%22%3EACER%3C/a%3E</link><description>&lt;p&gt;Data centre demand in Portugal is growing faster than supply.&lt;/p&gt;</description><pubDate>Mon, 09/07/2026 - 08:13</pubDate></item>
</channel></rss>`;
  const parsed = await new Parser().parseString(xml);
  assert.equal(typeof parsed.items[0].title, 'object');

  const item = parseFeedItem({ sourceRegistryId: 'acer-news', source: 'ACER', url: 'https://www.acer.europa.eu/rss.xml' }, parsed.items[0], NOW);

  assert.equal(item.title, 'ACER calls for better market modelling as data centre demand outpaces electricity supply in Portugal');
  assert.equal(item.url, 'https://www.acer.europa.eu/news/acer-calls-better-market-modelling');
  assert.equal(item.publishedAt, '2026-09-07T08:13:00.000Z');
  assert.equal(item.snippet, 'Data centre demand in Portugal is growing faster than supply.');
  assert.equal(textValue({ _: 'Lead', b: [{ _: 'bold' }], $: { attr: 'ignored' } }), 'Lead bold');
  assert.equal(textValue(null), '');
});

test('http item links are upgraded to https before the source-text gate sees them', () => {
  // Given: an arXiv-style item whose feed link still uses http.
  const feed = { sourceRegistryId: 'arxiv-cs-dc', source: 'arXiv', url: 'https://rss.arxiv.org/rss/cs.DC' };
  const item = parseFeedItem(feed, {
    title: 'LBFAST: A Lightweight Moment-Represented Lattice Boltzmann Solver for Multi-GPU Architectures',
    link: 'http://arxiv.org/abs/2609.09160',
    isoDate: '2026-09-10T04:00:00.000Z',
  }, NOW);

  // Then: the item carries the https URL the gate accepts, and the id is stable across schemes.
  assert.equal(item.url, 'https://arxiv.org/abs/2609.09160');
  assert.equal(httpsItemUrl('https://arxiv.org/abs/2609.09160'), 'https://arxiv.org/abs/2609.09160');
  assert.equal(httpsItemUrl('javascript:alert(1)'), '');
  assert.equal(httpsItemUrl(''), '');
});

test('an unparseable feed date falls back to the run time instead of throwing', () => {
  assert.equal(publishedAtIso({ pubDate: 'garbage' }, NOW), NOW.toISOString());
  assert.equal(publishedAtIso({ isoDate: '2026-09-09T10:00:00.000Z', pubDate: 'garbage' }, NOW), '2026-09-09T10:00:00.000Z');
  const item = parseFeedItem(
    { sourceRegistryId: 'fixture', source: 'Fixture', url: 'https://fixture.example/feed' },
    { title: 'Undated item', link: 'https://fixture.example/story', pubDate: 'not a date' },
    NOW,
  );
  assert.equal(item.publishedAt, NOW.toISOString());
});

test('abstract-only sources keep their relevance score but are capped at the signal-card lane', () => {
  // Given: the arXiv item that scored full_memo (0.83) on 2026-09-10 and was then quarantined
  // because a 1,671-character abstract cannot support a 4,500-character local memo.
  const article = {
    title: 'HBFSim: Fast and Faithful Simulation of High-Bandwidth Flash Under Real GPU Execution',
    snippet: 'Serving a large language model (LLM) is limited by memory capacity. High-Bandwidth Flash (HBF) stacks NAND flash inside the accelerator package, one tier below HBM.',
    articleText: 'Serving a large language model (LLM) is limited by memory capacity. High-Bandwidth Flash (HBF) stacks NAND flash inside the accelerator package, one tier below high-bandwidth memory, so an NVIDIA GPU can hold more weights per device. HBFSim simulates the device under real inference workloads on a GPU cluster and reports thermal and datacenter power effects.',
    source: 'arXiv',
    url: 'https://arxiv.org/abs/2609.09800',
  };
  const uncapped = classifyInfrastructureRelevance(article);
  const capped = classifyInfrastructureRelevance({ ...article, source_text_scope: 'abstract' });

  assert.equal(uncapped.infrastructure_relevance_tier, 'full_memo');
  assert.equal(capped.infrastructure_relevance_tier, 'signal_card');
  assert.equal(capped.infrastructure_relevance_score, uncapped.infrastructure_relevance_score);
  assert.equal(capped.infrastructure_relevance_action, 'publish_signal_card_only');
  assert.equal(capped.articlePagePublished, false);
  assert.equal(capped.homepagePublished, true);
  assert.ok(capped.infrastructure_relevance_reasons.includes('abstract_only_source_capped_at_signal_card'));

  // And: the feed object carries the scope so parseFeedItem stamps it on every item.
  const item = parseFeedItem(
    { sourceRegistryId: 'arxiv-cs-ar', source: 'arXiv', url: 'https://rss.arxiv.org/rss/cs.AR', textScope: 'abstract' },
    { title: article.title, link: article.url, contentSnippet: article.snippet, content: article.articleText, isoDate: '2026-09-10T04:00:00.000Z' },
    NOW,
  );
  assert.equal(item.source_text_scope, 'abstract');
  assert.notEqual(item.infrastructure_relevance_tier, 'full_memo');
  const plain = parseFeedItem(
    { sourceRegistryId: 'nsf-news', source: 'NSF', url: 'https://www.nsf.gov/rss/rss_www_news.xml' },
    { title: 'Undecorated item', link: 'https://www.nsf.gov/news/item', isoDate: '2026-09-10T04:00:00.000Z' },
    NOW,
  );
  assert.equal(Object.hasOwn(plain, 'source_text_scope'), false);
});

test('cached and legacy fallback pools re-stamp the registry text scope and reclassify', () => {
  // Given: a cached arXiv record classified before its registry row carried text_scope,
  // next to a DOE record whose row has no scope.
  const arxiv = authorizedSource('arxiv-cs-ar', 'arxiv.org', { name: 'arXiv', text_scope: 'abstract' });
  const doe = authorizedSource('doe-newsroom', 'energy.gov', { name: 'U.S. Department of Energy' });
  const cachedArxiv = {
    id: 'cached-arxiv',
    sourceRegistryId: 'arxiv-cs-ar',
    source: 'arXiv',
    url: 'https://arxiv.org/abs/2609.09800',
    title: 'HBFSim: Fast and Faithful Simulation of High-Bandwidth Flash Under Real GPU Execution',
    snippet: 'Serving a large language model (LLM) is limited by memory capacity. High-Bandwidth Flash (HBF) stacks NAND flash inside the accelerator package, one tier below HBM.',
    contentText: 'Serving a large language model (LLM) is limited by memory capacity. High-Bandwidth Flash (HBF) stacks NAND flash inside the accelerator package, one tier below high-bandwidth memory, so an NVIDIA GPU can hold more weights per device. HBFSim simulates the device under real inference workloads on a GPU cluster and reports thermal and datacenter power effects.',
    publishedAt: '2026-09-10T04:00:00.000Z',
    infrastructure_relevance_tier: 'full_memo',
    infrastructure_relevance_action: 'generate_full_memo',
    infrastructure_relevance: { infrastructure_relevance_score: 0.826, infrastructure_relevance_tier: 'full_memo', infrastructure_relevance_action: 'generate_full_memo' },
  };
  const cachedDoe = {
    id: 'cached-doe',
    sourceRegistryId: 'doe-newsroom',
    source: 'U.S. Department of Energy',
    url: 'https://www.energy.gov/articles/loan',
    title: 'Energy Department closes loan to restart nuclear plant for data center load',
    publishedAt: '2026-09-08T11:30:00.000Z',
    infrastructure_relevance_tier: 'full_memo',
    infrastructure_relevance: { infrastructure_relevance_tier: 'full_memo' },
  };

  // When: the fallback pool crosses the production authorization seam.
  const pool = authorizedTextFallbackPool([cachedArxiv, cachedDoe], [arxiv, doe], NOW);

  // Then: the arXiv record is capped everywhere the router looks, and the DOE record is untouched.
  const hydrated = pool.find((item) => item.id === 'cached-arxiv');
  assert.equal(hydrated.source_text_scope, 'abstract');
  assert.equal(hydrated.infrastructure_relevance_tier, 'signal_card');
  assert.equal(hydrated.infrastructure_relevance_action, 'publish_signal_card_only');
  assert.equal(hydrated.infrastructure_relevance.infrastructure_relevance_tier, 'signal_card');
  assert.equal(hydrated.articlePagePublished, false);
  assert.equal(pool.find((item) => item.id === 'cached-doe'), cachedDoe);
  // And: an already-stamped record is returned as-is.
  assert.equal(hydrateSourceTextScope([hydrated], [arxiv])[0], hydrated);
});

test('an abstract-only record can never anchor an authored column', () => {
  // Given: a column-grade story that would otherwise be selected, marked abstract-only.
  const abstractOnly = fixtureArticle({ id: 'abstract-001', source_text_scope: 'abstract' });
  assert.equal(abstractOnlySource(abstractOnly), true);
  assert.equal(abstractOnlySource(fixtureArticle()), false);

  // Then: it is refused as the primary source, while a full document still wins.
  assert.equal(selectColumnStory({ candidates: [abstractOnly], pool: [] }), null);
  const selected = selectColumnStory({ candidates: [abstractOnly, fixtureArticle()], pool: [abstractOnly] });
  assert.equal(selected?.article?.id, 'wire-001');

  // And: a legacy record without the stamped field is recognised through its registry row,
  // both from an explicit registry and from the production registry on disk.
  const legacy = fixtureArticle({ id: 'legacy-arxiv', sourceRegistryId: 'arxiv-cs-ar' });
  assert.equal(abstractOnlySource(legacy, [authorizedSource('arxiv-cs-ar', 'arxiv.org', { text_scope: 'abstract' })]), true);
  assert.equal(abstractOnlySource(legacy), true);
  assert.equal(selectColumnStory({ candidates: [legacy], pool: [] }), null);

  // And: column candidates drawn from the archive are re-stamped and reclassified first.
  const archived = {
    ...legacy,
    infrastructure_relevance_tier: 'full_memo',
    infrastructure_relevance: { infrastructure_relevance_tier: 'full_memo' },
    publishedAt: NOW.toISOString(),
  };
  const candidates = columnCandidateRecords({ latest: [], pool: [], existingArchive: [archived], now: NOW });
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].source_text_scope, 'abstract');
  assert.notEqual(candidates[0].infrastructure_relevance_tier, 'full_memo');
  assert.equal(candidates[0].infrastructure_relevance.infrastructure_relevance_tier, candidates[0].infrastructure_relevance_tier);
});

test('the autonomous source scan keeps the abstract scope and the selection engine holds it at the watchlist', () => {
  // Given: a cached arXiv record (no stamped scope) entering the global source scan.
  const arxiv = authorizedSource('arxiv-cs-ar', 'arxiv.org', { name: 'arXiv', text_scope: 'abstract' });
  const cached = {
    id: 'scan-arxiv',
    sourceRegistryId: 'arxiv-cs-ar',
    source: 'arXiv',
    url: 'https://arxiv.org/abs/2609.09800',
    title: 'HBFSim: Fast and Faithful Simulation of High-Bandwidth Flash Under Real GPU Execution',
    publishedAt: '2026-09-10T04:00:00.000Z',
    cleaned_source_text: 'Serving a large language model is limited by memory capacity. High-Bandwidth Flash stacks NAND flash inside the accelerator package, one tier below high-bandwidth memory, so a GPU can hold more weights per device. HBFSim simulates the device under real inference workloads on a GPU cluster and reports thermal and datacenter power effects across 64 servers.',
    infrastructure_relevance_score: 0.826,
    infrastructure_relevance_tier: 'full_memo',
  };

  // Then: the scope survives cleaning, whether stamped on the item or only on the registry row.
  const [scanned] = scanSourceItems([cached], [arxiv]);
  assert.equal(scanned.source_text_scope, 'abstract');
  assert.equal(scanned.sourceRegistryId, 'arxiv-cs-ar');
  assert.equal(cleanScanItem({ ...cached, source_text_scope: 'abstract' }).source_text_scope, 'abstract');
  assert.equal(Object.hasOwn(cleanScanItem(cached), 'source_text_scope'), false);

  // And: a cluster anchored on that item is held as a watchlist signal, never selected for analysis.
  const cluster = {
    cluster_id: 'sig-hbf',
    cluster_title: 'High-Bandwidth Flash for GPU memory capacity',
    cluster_topic: 'GPU memory and accelerator silicon',
    primary_infrastructure_layer: 'Silicon',
    extracted_facts: ['HBF stacks NAND flash inside the accelerator package.', 'It sits one tier below HBM.', 'HBFSim simulates real GPU inference workloads.', 'The study reports power effects across 64 servers.'],
    numeric_claims: [{ raw: '64 servers' }],
    signal_score: 88,
    representative_source: scanned,
  };
  assert.equal(abstractOnlyCluster(cluster), true);
  const capped = selectEditorialSignals([cluster]);
  assert.equal(capped.selected_for_analysis.length, 0);
  assert.equal(capped.held_signals.length, 1);
  assert.equal(capped.held_signals[0].editorial_route, 'Watchlist Signal');
  assert.equal(capped.held_signals[0].abstract_only_source, true);
  // A full-document source (registry id without a text scope, nothing stamped) is selected as usual.
  const uncapped = selectEditorialSignals([{ ...cluster, representative_source: { ...scanned, source_text_scope: undefined, sourceRegistryId: 'doe-newsroom' } }]);
  assert.equal(uncapped.selected_for_analysis.length, 1);
  assert.equal(uncapped.selected_for_analysis[0].editorial_route, 'Featured Analysis');
});

test('the public lane router and story gate never give an abstract-only source a core lane', () => {
  // Given: core-worthy source text from an arXiv record, with and without the stamped scope.
  const evidence = `${'Clean source evidence about data center power, storage, and semiconductor capacity for GPU clusters. '.repeat(20)}Final sentence complete.`;
  const article = {
    id: 'router-arxiv',
    title: 'High-Bandwidth Flash gives data center GPU clusters more memory capacity per server',
    articleText: evidence,
    cleaned_source_text: evidence,
    infrastructure_relevance_score: 0.9,
  };
  assert.equal(routeStrictInfrastructureRelevance(article).visibility, 'core');

  // Then: the stamped field, or the registry row of a legacy record, routes it to the adjacent lane.
  const stamped = routeStrictInfrastructureRelevance({ ...article, source_text_scope: 'abstract' });
  assert.equal(stamped.visibility, 'adjacent');
  assert.ok(stamped.blocked_reasons.includes('abstract_only_source_capped_at_signal_card'));
  const legacy = routeStrictInfrastructureRelevance({ ...article, sourceRegistryId: 'arxiv-cs-ar' });
  assert.equal(legacy.visibility, 'adjacent');
  assert.equal(abstractOnlyTextScope({ sourceRegistryId: 'arxiv-cs-ar' }), true);
  assert.equal(abstractOnlyTextScope({ sourceRegistryId: 'doe-newsroom' }), false);
  assert.equal(abstractOnlyTextScope({ sourceRegistryId: 'x' }, [authorizedSource('x', 'x.example', { text_scope: 'abstract' })]), true);

  // And: applyPublicRouting() yields a signal card and the story gate refuses a full article.
  const routed = applyPublicRouting({ ...article, source_text_scope: 'abstract' });
  assert.equal(routed.signalCardOnly, true);
  assert.equal(routed.articlePagePublished, false);
  const gate = canGenerateFullArticle({ ...article, source_text_scope: 'abstract' });
  assert.equal(gate.ok, false);
  assert.ok(gate.reasons.includes('adjacent_watchlist'));
});

test('a source whose best item is off-beat does not reserve a pool slot ahead of on-beat items', () => {
  // Given: source A has three on-beat items and source B only an archive-only notice.
  const item = (source, index, score, tier) => ({
    id: `${source}-${index}`,
    source,
    title: `${source} story ${index}`,
    publishedAt: '2026-09-09T00:00:00.000Z',
    infrastructure_relevance_score: score,
    infrastructure_relevance_tier: tier,
  });
  const pool = selectPoolItems([
    item('B', 1, 0.1, 'archive_only'),
    item('A', 1, 0.9, 'full_memo'),
    item('A', 2, 0.8, 'full_memo'),
    item('A', 3, 0.7, 'signal_card'),
  ], NOW.getTime());

  // Then: B's notice is ordered after every on-beat item rather than taking a reserved slot.
  assert.deepEqual(pool.map((entry) => entry.id), ['A-1', 'A-2', 'A-3', 'B-1']);
});

test('arXiv abstract pages extract only the abstract text', async () => {
  const source = authorizedSource('arxiv-cs-dc', 'arxiv.org', { article_hosts: 'arxiv.org,www.arxiv.org' });
  const abstract = 'We present LBFAST, a lightweight lattice Boltzmann solver designed for multi-GPU architectures. '
    + 'The solver keeps moment representations resident in device memory so that inter-node traffic falls by half. '
    + 'On a 64-GPU cluster it sustains 92 percent scaling efficiency while cutting energy per iteration by a third. '
    + 'We release the implementation under an open licence and report power draw for every configuration tested.';
  const html = `<html><body><header><nav><a href="/">arXiv</a> <a href="/list/cs.DC/recent">cs.DC</a></nav></header>
<main><div id="abs"><h1 class="title mathjax"><span class="descriptor">Title:</span>LBFAST</h1>
<blockquote class="abstract mathjax"><span class="descriptor">Abstract:</span>${abstract}</blockquote>
<div class="submission-history">From: Author Name [view email] [v1] Wed, 9 Sep 2026 12:00:00 UTC</div></div>
<div class="labstabs"><p>arXivLabs is a framework that allows collaborators to develop and share new arXiv features directly on our website.</p>
<p>Both individuals and organizations that work with arXivLabs have embraced and accepted our values of openness, community, excellence, and user data privacy.</p></div></main>
<footer><p>Copyright arXiv operational status. All rights reserved.</p></footer></body></html>`;

  const { articleText, extractionQa } = await extractWith(source, 'https://arxiv.org/abs/2609.09160', html);

  assert.ok(articleText.startsWith('We present LBFAST'), articleText);
  assert.ok(!/Abstract:/.test(articleText));
  assert.ok(!/arXivLabs/.test(articleText));
  assert.equal(extractionQa.source_domain_adapter, 'arxiv');
});

test('Federal Register documents drop printed-page markers and the FR Doc trailer', async () => {
  const source = authorizedSource('federal-register-ferc', 'federalregister.gov', {
    article_hosts: 'federalregister.gov,www.federalregister.gov',
  });
  const html = `<html><body><nav><a href="/">Federal Register</a></nav>
<main><aside><p>This document has a comment period that ends in 30 days. Submit a formal comment now.</p></aside>
<div id="fulltext_content_area" class="fulltext-content">
<div class="document-headings-note"><p>Document headings vary by document type but may contain the following:</p><ul><li>the agency or agencies that issued and signed a document</li><li>the number of the CFR title and the number of each part the document amends, proposes to amend, or is directly related to</li></ul><p>See the Document Drafting Handbook for more details.</p></div>
<p>The Federal Energy Regulatory Commission hereby gives notice that the interconnection procedures for large loads above 100 megawatts will be revised to require cluster studies and firm transmission service commitments before energization. Start Printed Page 43210 Any person desiring to intervene or to protest this filing must file in accordance with Rules 211 and 214 of the Commission's Rules of Practice and Procedure.</p>
<p>The Commission encourages electronic submission of protests and interventions in lieu of paper using the eFiling link at the Commission's website, and comment date requirements apply to every party that seeks to participate in the proceeding.</p>
<p>[FR Doc. 2026-18361 Filed 9-8-26; 8:45 am]</p>
<p>BILLING CODE 6717-01-P</p>
</div></main><footer><p>Privacy policy. All rights reserved.</p></footer></body></html>`;

  const { articleText, extractionQa } = await extractWith(
    source,
    'https://www.federalregister.gov/documents/2026/09/09/2026-18361/sunshine-act-meeting-notice',
    html,
  );

  assert.ok(articleText.includes('hereby gives notice'), articleText);
  assert.ok(!/Start Printed Page/.test(articleText));
  assert.ok(!/BILLING CODE/.test(articleText));
  assert.ok(!/FR Doc\./.test(articleText));
  assert.ok(!/comment period that ends/.test(articleText));
  assert.ok(!/Document headings vary/.test(articleText), articleText);
  assert.ok(!/Document Drafting Handbook/.test(articleText), articleText);
  assert.ok(!/the agency or agencies that issued/.test(articleText), articleText);
  assert.ok(articleText.startsWith('The Federal Energy Regulatory Commission hereby gives notice'), articleText);
  assert.equal(extractionQa.source_domain_adapter, 'federalregister');
});

// Run #3199 published this hydro relicensing notice as a signal card: the
// extracted text names "power" and "megawatts" often enough to saturate the
// grid dimension (0.615) although nothing in it concerns compute.
const HYDRO_NOTICE = {
  id: 'aa7900ef9280e5f6',
  sourceRegistryId: 'federal-register-ferc',
  source: 'Federal Register',
  url: 'https://www.federalregister.gov/documents/2026/09/10/2026-18456/idaho-power-company-notice-of-availability-of-the-final-supplemental-environmental-impact-statement',
  title: 'Idaho Power Company; Notice of Availability of the Final Supplemental Environmental Impact Statement for the Hells Canyon Hydroelectric Project',
  snippet: 'Idaho Power Company has released a final supplemental environmental impact statement for the Hells Canyon Hydroelectric Project, which generates over 1,222 MW of power.',
  contentText: 'In accordance with the National Environmental Policy Act of 1969 and the Federal Energy Regulatory Commission\'s regulations, the Office of Energy Projects has reviewed Idaho Power Company\'s application for a new license to continue to operate and maintain the Hells Canyon Hydroelectric Project and has prepared a final supplemental environmental impact statement for the project. The project consists of three developments with a total installed capacity of 1,222 megawatts of power. The project generates power for the utility\'s customers and the power is delivered over transmission lines. Staff recommends licensing the project with the measures in the final supplemental EIS. The final supplemental EIS is available for review; copies can be obtained from the Commission\'s public reference room.',
  publishedAt: '2026-09-10T04:00:00.000Z',
};

const DOCKET_NOTICES = [
  {
    title: 'Enable Gas Transmission, LLC; Notice of Request Under Blanket Authorization and Establishing Intervention and Protest Deadline',
    contentText: 'Take notice that Enable Gas Transmission filed a prior notice request under its blanket certificate to abandon a compressor unit and to replace pipeline facilities. The power of the replacement compressor is 1,200 horsepower. Any person may protest or intervene in the proceeding.',
  },
  {
    title: 'Agency Information Collection Extension',
    contentText: 'The Department of Energy invites public comment on a proposed three-year extension of an information collection for power and transmission data submitted by utilities under the Federal Power Act.',
  },
  {
    title: 'Notice of Effectiveness of Exempt Wholesale Generator and Foreign Utility Company Status',
    contentText: 'Take notice that the exempt wholesale generator status of the listed power companies and the foreign utility company status of the listed entities is effective. The generators sell power at wholesale and interconnect with the utility grid.',
  },
];

test('procedural Federal Register docket notices stay archive-only without compute context', () => {
  // Given: the notice exactly as it reached the wire, with the score it earned there.
  assert.equal(proceduralDocketWithoutComputeContext(HYDRO_NOTICE), true);
  const classified = classifyInfrastructureRelevance(HYDRO_NOTICE);
  assert.equal(classified.infrastructure_relevance_tier, 'archive_only', JSON.stringify(classified));
  assert.ok(classified.infrastructure_relevance_score <= 0.44, String(classified.infrastructure_relevance_score));
  assert.ok(classified.infrastructure_relevance_reasons.includes('procedural_regulatory_docket_without_compute_context'));

  // The stored 0.615 must not keep it on the homepage: the router archives it
  // and the public content tier pass hides it on the next run.
  const stored = { ...HYDRO_NOTICE, infrastructure_relevance_score: 0.615, infrastructure_relevance_tier: 'signal_card', homepagePublished: true, signalCardOnly: true };
  const route = routeStrictInfrastructureRelevance(stored);
  assert.equal(route.visibility, 'archive');
  assert.deepEqual(route.blocked_reasons, ['procedural_regulatory_docket_without_compute_context']);
  const tiered = applyPublicContentTier(stored);
  assert.equal(tiered.homepagePublished, false);
  assert.equal(tiered.archiveOnly, true);
  assert.equal(tiered.public_content_tier, 'hidden');

  for (const notice of DOCKET_NOTICES) {
    const result = classifyInfrastructureRelevance({ ...notice, source: 'Federal Register' });
    assert.equal(result.infrastructure_relevance_tier, 'archive_only', `${notice.title}: ${result.infrastructure_relevance_score}`);
    assert.equal(routeStrictInfrastructureRelevance({ ...notice, source: 'Federal Register', infrastructure_relevance_score: 0.7 }).visibility, 'archive', notice.title);
  }
});

test('the docket guard releases notices that carry compute or large-load context', () => {
  // Given: the same hydro notice once the filing concerns a co-located data center load.
  const coLocated = {
    ...HYDRO_NOTICE,
    contentText: `${HYDRO_NOTICE.contentText} The licensee also asks the Commission to approve a 300 MW large load interconnection for a data center campus co-located at the plant.`,
  };
  assert.equal(proceduralDocketWithoutComputeContext(coLocated), false);
  const classified = classifyInfrastructureRelevance(coLocated);
  assert.ok(classified.infrastructure_relevance_score >= 0.55, String(classified.infrastructure_relevance_score));
  assert.ok(!classified.infrastructure_relevance_reasons.includes('procedural_regulatory_docket_without_compute_context'));
  assert.notEqual(routeStrictInfrastructureRelevance(coLocated).visibility, 'archive');

  // Server capacity language, unlike agency boilerplate about servers, is compute context.
  const serverRacks = {
    ...HYDRO_NOTICE,
    contentText: `${HYDRO_NOTICE.contentText} The licensee proposes to host 40 MW of server racks in a new hall beside the powerhouse.`,
  };
  assert.equal(proceduralDocketWithoutComputeContext(serverRacks), false);

  // A FERC rulemaking on large-load interconnection is a docket item too, but it is the beat.
  const largeLoadRule = {
    source: 'Federal Register',
    title: 'Large Load Interconnection Procedures; Notice of Proposed Rulemaking',
    contentText: 'The Commission proposes to revise the interconnection procedures for large loads above 100 megawatts, including data centers, to require cluster studies and firm transmission service commitments before energization.',
  };
  assert.equal(proceduralDocketWithoutComputeContext(largeLoadRule), false);
  assert.ok(classifyInfrastructureRelevance(largeLoadRule).infrastructure_relevance_score >= 0.55);

  // Ordinary words that also live in the broad AI vocabulary do not release
  // the notice: safety training, a particle accelerator, an inference about
  // the schedule, a Colorado abbreviation, pumped storage with backup power.
  for (const filler of [
    'All plant staff completed the annual safety training program before the inspection.',
    'The licensee operates a small particle accelerator at the research annex and an inference about the outage schedule is included.',
    'The licensee is headquartered in Denver, Colo., and the plant provides pumped storage and backup power for the region.',
    'The filing is available from agency servers and the Commission\'s eLibrary system; the computing of annual charges follows 18 CFR part 11.',
  ]) {
    const decorated = { ...HYDRO_NOTICE, contentText: `${HYDRO_NOTICE.contentText} ${filler}` };
    assert.equal(proceduralDocketWithoutComputeContext(decorated), true, filler);
    assert.equal(classifyInfrastructureRelevance(decorated).infrastructure_relevance_tier, 'archive_only', filler);
    assert.equal(routeStrictInfrastructureRelevance({ ...decorated, infrastructure_relevance_score: 0.627 }).visibility, 'archive', filler);
  }

  // Generated copy never releases the cap: only the title, the extracted body
  // (or the feed snippet before extraction) and the source metadata count.
  const enrichedNotice = {
    ...DOCKET_NOTICES[1],
    sourceRegistryId: 'federal-register-doe',
    source: 'Federal Register',
    url: 'https://www.federalregister.gov/documents/2026/09/10/2026-18460/agency-information-collection-extension',
    snippet: 'Data center operators and AI campus developers should watch this filing.',
    summary: 'Data center operators and AI campus developers should watch this filing.',
    insight: 'Hyperscalers building GPU clusters will feel this information collection first.',
    infrastructure_relevance_score: 0.66,
  };
  assert.equal(proceduralDocketWithoutComputeContext(enrichedNotice), true);
  assert.equal(classifyInfrastructureRelevance(enrichedNotice).infrastructure_relevance_tier, 'archive_only');
  assert.equal(routeStrictInfrastructureRelevance(enrichedNotice).visibility, 'archive');

  // The same notice is released when the source body itself names the load.
  const sourceNamesLoad = {
    ...enrichedNotice,
    summary: 'A routine paperwork extension.',
    insight: '',
    contentText: `${DOCKET_NOTICES[1].contentText} The collection adds a schedule for large load customers above 100 MW, including data centers.`,
  };
  assert.equal(proceduralDocketWithoutComputeContext(sourceNamesLoad), false);

  // Before extraction only the feed snippet stands in for the body.
  const feedOnlyNotice = {
    sourceRegistryId: 'federal-register-ferc',
    source: 'Federal Register',
    url: 'https://www.federalregister.gov/documents/2026/09/10/2026-18470/notice-of-application',
    title: 'Notice of Application Accepted for Filing and Soliciting Comments',
    snippet: 'Application for a 400 MW large load interconnection serving a data center campus.',
  };
  assert.equal(proceduralDocketWithoutComputeContext(feedOnlyNotice), false);
  assert.equal(proceduralDocketWithoutComputeContext({ ...feedOnlyNotice, snippet: 'Application to amend the hydro license for the 40 MW project.' }), true);

  // A plain grid item without a docket pattern is untouched by the guard.
  const gridOrder = {
    source: 'U.S. Department of Energy',
    title: 'Energy Secretary Secures Carolinas\' Grid Ahead of Holiday Weekend',
    contentText: 'The Department of Energy issued an emergency order directing the utility to keep 800 megawatts of generation available to the grid through the weekend peak.',
  };
  assert.equal(proceduralDocketWithoutComputeContext(gridOrder), false);
  assert.ok(!classifyInfrastructureRelevance(gridOrder).infrastructure_relevance_reasons.includes('procedural_regulatory_docket_without_compute_context'));
});

test('cached and legacy records that the docket guard catches are demoted before curation', () => {
  // Given: the Hells Canyon record as the cached pool and the archive still store it.
  const federalRegister = authorizedSource('federal-register-ferc', 'federalregister.gov', {
    name: 'Federal Register',
    article_hosts: 'federalregister.gov,www.federalregister.gov',
  });
  const cached = {
    ...HYDRO_NOTICE,
    infrastructure_relevance_score: 0.615,
    infrastructure_relevance_tier: 'signal_card',
    infrastructure_relevance_action: 'publish_signal_card_only',
    infrastructure_relevance_reasons: ['power_grid_relevance:1.00(power, megawatt, megawatts)'],
    homepagePublished: true,
    archiveOnly: false,
    signalCardOnly: true,
    infrastructure_relevance: { infrastructure_relevance_score: 0.615, infrastructure_relevance_tier: 'signal_card' },
  };
  const untouched = {
    id: 'cached-doe-order',
    sourceRegistryId: 'doe-newsroom',
    source: 'U.S. Department of Energy',
    url: 'https://www.energy.gov/articles/order',
    title: 'Energy Secretary Secures Carolinas\' Grid Ahead of Holiday Weekend',
    contentText: 'The Department of Energy issued an emergency order directing the utility to keep 800 megawatts of generation available to the grid through the weekend peak.',
    publishedAt: '2026-09-08T11:30:00.000Z',
    infrastructure_relevance_tier: 'signal_card',
    infrastructure_relevance: { infrastructure_relevance_tier: 'signal_card' },
  };

  // When: the fallback pool, the column candidates and the regenerators refresh cached relevance.
  const doe = authorizedSource('doe-newsroom', 'energy.gov', { name: 'U.S. Department of Energy' });
  const refreshedSets = [
    { name: 'refreshCachedRelevance', records: refreshCachedRelevance([cached, untouched], [federalRegister, doe]), identity: true },
    { name: 'authorizedTextFallbackPool', records: authorizedTextFallbackPool([cached, untouched], [federalRegister, doe], NOW), identity: true },
    // Column candidates are normalised on the way in, so identity is not expected there.
    { name: 'columnCandidateRecords', records: columnCandidateRecords({ latest: [cached], pool: [untouched], existingArchive: [], now: NOW, sources: [federalRegister, doe] }), identity: false },
  ];
  for (const { name, records, identity } of refreshedSets) {
    const demoted = records.find((item) => item.id === cached.id);
    assert.equal(demoted.infrastructure_relevance_tier, 'archive_only', name);
    assert.equal(demoted.infrastructure_relevance_action, 'archive_only', name);
    assert.ok(demoted.infrastructure_relevance_score <= 0.44, `${name}: ${demoted.infrastructure_relevance_score}`);
    assert.ok(demoted.infrastructure_relevance_reasons.includes('procedural_regulatory_docket_without_compute_context'), name);
    assert.equal(demoted.homepagePublished, false, name);
    assert.equal(demoted.archiveOnly, true, name);
    assert.equal(demoted.infrastructure_relevance.infrastructure_relevance_tier, 'archive_only', name);
    // And: a record the guard does not catch keeps its classification (and its identity where records pass through untouched).
    const kept = records.find((item) => item.id === untouched.id);
    assert.equal(kept.infrastructure_relevance_tier, 'signal_card', name);
    assert.ok(!(kept.infrastructure_relevance_reasons || []).includes('procedural_regulatory_docket_without_compute_context'), name);
    if (identity) assert.equal(kept, untouched, name);
  }

  // And: the autonomous scan carries the archive decision on the cleaned item and drops the notice
  // before clustering, while the DOE order passes through.
  const cleaned = cleanScanItem(refreshCachedRelevance([cached], [federalRegister])[0]);
  assert.equal(cleaned.procedural_docket_notice, true);
  assert.equal(cleaned.infrastructure_relevance_tier, 'archive_only');
  assert.ok(cleaned.infrastructure_relevance_reasons.includes('procedural_regulatory_docket_without_compute_context'));
  const scanned = scanSourceItems([cached, untouched], [federalRegister, doe]);
  assert.deepEqual(scanned.map((item) => item.id), [untouched.id]);

  // And: a cluster built elsewhere on that item is archived by the selection engine whatever it scores.
  const cluster = {
    cluster_id: 'sig-hells-canyon',
    cluster_title: 'Hells Canyon hydro relicensing keeps 1,222 MW on the grid',
    cluster_topic: 'Hydro generation and grid power',
    primary_infrastructure_layer: 'Power',
    extracted_facts: ['The project has an installed capacity of 1,222 megawatts.', 'Staff recommends licensing the project.', 'The project spans three developments.', 'Power is delivered over transmission lines.'],
    numeric_claims: [{ raw: '1,222 megawatts' }],
    signal_score: 79,
    representative_source: cleaned,
  };
  assert.equal(proceduralDocketCluster(cluster), true);
  const selection = selectEditorialSignals([cluster]);
  assert.equal(selection.selected_for_analysis.length, 0);
  assert.equal(selection.held_signals.length, 0);
  assert.equal(selection.rejected_signals[0].editorial_route, 'Internal Archive');
  assert.equal(selection.rejected_signals[0].procedural_docket_notice, true);
  // A legacy cleaned item without the flag is re-checked through its original record.
  const { procedural_docket_notice: _flag, ...legacyCleaned } = cleaned;
  assert.equal(proceduralDocketCluster({ ...cluster, representative_source: legacyCleaned }), true);
  // The same cluster on the DOE order is routed on its merits.
  const doeCluster = { ...cluster, representative_source: cleanScanItem(untouched) };
  assert.equal(proceduralDocketCluster(doeCluster), false);
  assert.notEqual(selectEditorialSignals([doeCluster]).ranked_candidates[0].editorial_route, 'Internal Archive');
});

test('the homepage product-fit check recognises a docket notice through its source identity', () => {
  // Given: the published hydro notice as the homepage sees it, with its verified extraction
  // artifact and the editorial_brief tier an earlier run stored.
  const sourceUrl = HYDRO_NOTICE.url;
  const cleanedExtractedText = `${HYDRO_NOTICE.contentText} ${Array.from({ length: 6 }, (_, index) => `Section ${index + 1} of the final supplemental EIS records a distinct licensing measure for the project.`).join(' ')}`;
  const artifact = createExtractionArtifact({
    sourceUrl,
    cleanedExtractedText,
    extractionQa: { public_publishable: true, can_generate_longform: true, sentence_completion_score: 1 },
  });
  const published = {
    ...HYDRO_NOTICE,
    sourceUrl,
    extraction_artifact: artifact,
    extraction_quality_score: 0.92,
    infrastructure_relevance_score: 0.615,
    infrastructure_relevance_tier: 'signal_card',
    homepagePublished: true,
    articlePagePublished: false,
    archiveOnly: false,
    signalCardOnly: true,
    public_status: 'published',
    public_content_tier: 'editorial_brief',
  };

  // Then: product fit fails on the docket decision even though the projection holds only verified evidence,
  // and the homepage feed drops the record instead of re-opening its archive route through the stored tier.
  const fit = publicProductFitResult(published);
  assert.equal(fit.ok, false);
  assert.ok(fit.reasons.includes('procedural_regulatory_docket_without_compute_context'), fit.reasons.join(', '));
  assert.equal(buildHomepageFeed([published]).items.length, 0);

  // And: the same filing about a co-located data center load passes the product-fit check.
  const coLocatedText = `${cleanedExtractedText} The licensee also asks the Commission to approve a 300 MW large load interconnection for a data center campus co-located at the plant.`;
  const coLocated = {
    ...published,
    contentText: coLocatedText,
    extraction_artifact: createExtractionArtifact({
      sourceUrl,
      cleanedExtractedText: coLocatedText,
      extractionQa: { public_publishable: true, can_generate_longform: true, sentence_completion_score: 1 },
    }),
  };
  assert.equal(isPublicProductFit(coLocated), true, publicProductFitResult(coLocated).reasons.join(', '));
});

test('definitive archive decisions leave the curation planning pool', () => {
  // Given: the demoted hydro notice, a hard-archive item, an extracted archive-only item,
  // and a snippet-only archive-only item the curation model may still weigh.
  const federalRegister = authorizedSource('federal-register-ferc', 'federalregister.gov', {
    name: 'Federal Register',
    article_hosts: 'federalregister.gov,www.federalregister.gov',
  });
  const hydro = refreshCachedRelevance([{
    ...HYDRO_NOTICE,
    infrastructure_relevance_score: 0.615,
    infrastructure_relevance_tier: 'signal_card',
    score: 56,
  }], [federalRegister])[0];
  assert.equal(definitivelyArchived(hydro), true);
  const dinosaur = {
    id: 'dino',
    source: 'Science Daily',
    title: 'A new stegosaurus skeleton rewrites the fossil record',
    snippet: 'Museum staff unveiled the dinosaur fossil.',
    publishedAt: NOW.toISOString(),
    score: 40,
    infrastructure_relevance_tier: 'archive_only',
    infrastructure_relevance_reasons: ['hard_archive_topic_outside_compute_current_boundary'],
  };
  const extractedArchive = {
    id: 'extracted-archive',
    source: 'U.S. Nuclear Regulatory Commission',
    title: 'NRC Proposes Rule That Will Protect Drinking Water Near Uranium Mills',
    cleaned_source_text: 'The rule sets groundwater protection standards for uranium recovery facilities.',
    publishedAt: NOW.toISOString(),
    score: 38,
    infrastructure_relevance_tier: 'archive_only',
    infrastructure_relevance_reasons: ['power_grid_relevance:0.26(nuclear)'],
  };
  const snippetOnly = {
    id: 'duane-arnold',
    source: 'U.S. Department of Energy',
    title: 'Energy Department Closes $1.9 Billion Loan to Restart Duane Arnold Nuclear Plant',
    snippet: 'The loan supports the restart of the 615 MW plant.',
    publishedAt: NOW.toISOString(),
    score: 44,
    infrastructure_relevance_score: 0.28,
    infrastructure_relevance_tier: 'archive_only',
    infrastructure_relevance_reasons: ['power_grid_relevance:0.35(nuclear)'],
  };
  assert.equal(definitivelyArchived(dinosaur), true);
  assert.equal(definitivelyArchived(extractedArchive), true);
  assert.equal(definitivelyArchived(snippetOnly), false);

  // When: the daily plan draws its candidates.
  const candidates = rollingCandidates([hydro, dinosaur, extractedArchive, snippetOnly], { publishedIds: [] }, null, NOW);

  // Then: only the snippet-only item is left for the model or the deterministic ranker.
  assert.deepEqual(candidates.map((item) => item.id), ['duane-arnold']);
});

test('the docket guard reads canonical source evidence, not generated prose', () => {
  // Given: an autonomous record whose generated body mentions data centers while the
  // verified source evidence is a bare information-collection notice.
  const generated = {
    sourceRegistryId: 'federal-register-doe',
    source: 'Federal Register',
    url: 'https://www.federalregister.gov/documents/2026/09/10/2026-18460/agency-information-collection-extension',
    title: 'Agency Information Collection Extension',
    contentText: 'Data center operators and AI campus developers should read this filing as a signal that hyperscale load will be counted.',
    articleText: 'Data center operators and AI campus developers should read this filing as a signal that hyperscale load will be counted.',
    fullArticleText: 'Data center operators and AI campus developers should read this filing as a signal that hyperscale load will be counted.',
    cleaned_source_text: 'The Department of Energy invites public comment on a proposed three-year extension of an information collection for power and transmission data submitted by utilities.',
    source_evidence_text: 'The Department of Energy invites public comment on a proposed three-year extension of an information collection for power and transmission data submitted by utilities.',
    infrastructure_relevance_score: 0.7,
  };
  assert.equal(proceduralDocketWithoutComputeContext(generated), true);
  assert.equal(routeStrictInfrastructureRelevance(generated).visibility, 'archive');

  // And: a wire record before extraction is judged on its feed body, then its snippet.
  const wire = { ...generated, contentText: `${generated.cleaned_source_text} The schedule covers large load customers above 100 MW.`, articleText: undefined, fullArticleText: undefined, cleaned_source_text: undefined, source_evidence_text: undefined };
  assert.equal(proceduralDocketWithoutComputeContext(wire), false);
});

test('the docket guard is scoped to docket sources and formulaic notices', () => {
  // Given: the archived EIA analysis that mentions hydroelectric generation in passing (stored 0.795).
  const eiaImports = {
    id: '9a641af25826b599',
    sourceRegistryId: 'eia-today-in-energy',
    source: 'U.S. Energy Information Administration',
    url: 'https://www.eia.gov/todayinenergy/detail.php?id=67867',
    title: 'New York imports more electricity from Canada after high-voltage transmission line opens',
    articleText: 'The Champlain Hudson Power Express transmission line began delivering up to 1,250 megawatts of power from Quebec into New York City. The line was taken offline again on July 4 for further repairs. In recent years, both ISO-New England and NYISO have relied less on electricity imports from Canada as drought conditions have limited hydroelectric generation.',
    infrastructure_relevance_score: 0.795,
  };
  assert.equal(proceduralDocketWithoutComputeContext(eiaImports), false);
  assert.notEqual(routeStrictInfrastructureRelevance(eiaImports).visibility, 'archive');
  assert.ok(!classifyInfrastructureRelevance(eiaImports).infrastructure_relevance_reasons.includes('procedural_regulatory_docket_without_compute_context'));

  // An EIA pipeline note is grid coverage, not a docket filing.
  const eiaPipelines = {
    sourceRegistryId: 'eia-today-in-energy',
    source: 'U.S. Energy Information Administration',
    url: 'https://www.eia.gov/todayinenergy/detail.php?id=67901',
    title: 'Eight petroleum liquids pipeline projects have been completed since the start of 2026',
    articleText: 'Operators completed eight natural gas pipeline and petroleum liquids projects adding 1.4 million barrels per day of capacity; the power sector relies on the gas transmission network for generation.',
  };
  assert.equal(proceduralDocketWithoutComputeContext(eiaPipelines), false);

  // A trade headline that borrows notice wording is not a docket source either.
  const tradeHeadline = {
    source: 'Data Center Dynamics',
    url: 'https://www.datacenterdynamics.com/en/news/notice-of-availability-utility-files-hydroelectric-plan/',
    title: 'Notice of availability: utility files hydroelectric relicensing plan',
    snippet: 'The utility filed its relicensing plan with regulators; the plant generates 900 megawatts of power for the grid.',
  };
  assert.equal(proceduralDocketWithoutComputeContext(tradeHeadline), false);

  // Inside a docket source, FERC's "Take notice that" opener is enough even when the title is bare.
  const bareTitleNotice = {
    sourceRegistryId: 'federal-register-ferc',
    source: 'Federal Register',
    url: 'https://www.federalregister.gov/documents/2026/09/10/2026-18470/pacific-gas-and-electric-company',
    title: 'Pacific Gas and Electric Company',
    contentText: 'Take notice that on September 3, 2026, Pacific Gas and Electric Company filed an application to amend its license for the Drum-Spaulding hydroelectric project, which has an installed capacity of 190 megawatts of power delivered to the utility grid.',
  };
  assert.equal(proceduralDocketWithoutComputeContext(bareTitleNotice), true);
  assert.equal(classifyInfrastructureRelevance(bareTitleNotice).infrastructure_relevance_tier, 'archive_only');

  // A docket rule without notice wording is left to the ordinary score.
  const bulkPowerRule = {
    sourceRegistryId: 'federal-register-doe',
    source: 'Federal Register',
    url: 'https://www.federalregister.gov/documents/2026/09/08/2026-18300/securing-the-united-states-bulk-power-system',
    title: 'Securing the United States Bulk-Power System',
    contentText: 'The Department of Energy prohibits the acquisition of bulk-power system electric equipment from foreign adversaries for transformers, substations and grid control systems that serve critical loads.',
  };
  assert.equal(proceduralDocketWithoutComputeContext(bulkPowerRule), false);
});

test('Commission press-corner pages are read through the same-host documents API', async () => {
  // Given: the Angular detail URL from the Commission feed and the API payload shape seen on 2026-09-10.
  const source = authorizedSource('ec-press-corner', 'ec.europa.eu', { article_hosts: 'ec.europa.eu' });
  const detailUrl = 'https://ec.europa.eu/commission/presscorner/detail/en/ip_26_1799';
  const target = ecPresscornerApiTarget(detailUrl);
  assert.equal(target.url, 'https://ec.europa.eu/commission/presscorner/api/documents?reference=IP%2F26%2F1799&language=en');
  assert.equal(ecPresscornerApiTarget('https://ec.europa.eu/commission/presscorner/home/en'), null);

  const paragraph = 'Today, the Commission has decided to provide Spain with &euro;114.7 million in emergency assistance to help manage the situation, '
    + 'building on the operational support that the EU agencies already deploy and on the coordination the Commission provides on the ground every day.';
  const payload = JSON.stringify({
    ky: 212611,
    docuLanguageResource: {
      title: 'Commission grants Spain 114.7 million',
      htmlContent: `<p>${paragraph}</p><p>The exact modalities will be agreed between the EU agencies and the relevant Spanish authorities before the end of the month, the Commission said in its statement today.</p>`,
      language: 'EN',
    },
  });
  const requests = [];
  const { articleText, extractionQa } = await fetchArticleExtraction({
    url: detailUrl,
    title: 'Commission grants Spain 114.7 million',
    fallbackSnippet: 'Fixture snippet.',
    sourceRegistryId: source.id,
    sources: [source],
    now: NOW,
    networkOptions: {
      resolveHost: async () => PUBLIC_ADDRESS,
      request: async ({ target: requested, headers }) => {
        requests.push({ url: requested.href, accept: headers.accept });
        return bodyResponse('application/json', payload);
      },
    },
  });

  // Then: the API, not the Angular shell, was fetched and its HTML content became the article text.
  assert.deepEqual(requests, [{ url: target.url, accept: 'application/json' }]);
  assert.ok(articleText.startsWith('Today, the Commission has decided'), articleText);
  assert.ok(articleText.includes('relevant Spanish authorities'));
  assert.equal(extractionQa.source_domain_adapter, 'ec-presscorner');
});

test('the 2026-09 expansion sources are text-authorized and accept their real article hosts', async () => {
  const sources = await loadSourceRegistry();
  const active = new Set(activeRegistryFeeds(sources, NOW).map((feed) => feed.sourceRegistryId));
  const samples = [
    ['federal-register-ferc', 'https://www.federalregister.gov/documents/2026/09/09/2026-18361/sunshine-act-meeting-notice'],
    ['federal-register-doe', 'https://www.federalregister.gov/documents/2026/09/08/2026-18300/securing-the-united-states-bulk-power-system'],
    ['federal-register-bis', 'https://www.federalregister.gov/documents/2026/09/02/2026-18000/revisions-to-the-entity-list'],
    ['federal-register-data-center-search', 'https://www.federalregister.gov/documents/2026/09/01/2026-17900/privacy-act-of-1974-system-of-records'],
    ['federal-register-ai-search', 'https://www.federalregister.gov/documents/2026/09/08/2026-18300/securing-the-united-states-bulk-power-system'],
    ['whitehouse-presidential-actions', 'https://www.whitehouse.gov/presidential-actions/2026/09/adjusting-certain-delegations-under-the-defense-production-act-e2de/'],
    ['nsf-news', 'https://www.nsf.gov/news/new-nsf-state-regional-ai-infrastructure-hubs-will-power-ai'],
    ['sec-press', 'https://www.sec.gov/newsroom/press-releases/2026-81-sec-proposes-modernize-rules-registered-transfer-agents'],
    ['acer-news', 'https://www.acer.europa.eu/news/acer-calls-better-market-modelling-data-centre-demand-outpaces-electricity-supply-portugal'],
    ['ec-press-corner', 'https://ec.europa.eu/commission/presscorner/detail/en/ip_26_1799'],
    ['arxiv-cs-dc', 'https://arxiv.org/abs/2609.09160'],
    ['arxiv-cs-ar', 'https://arxiv.org/abs/2609.09208'],
    ['arxiv-cs-pf', 'https://arxiv.org/abs/2609.09254'],
  ];

  for (const [id, url] of samples) {
    assert.ok(active.has(id), `${id} should be an active text-authorized feed`);
    const decision = sourceTextTargetDecision({ sourceRegistryId: id, url }, sources, NOW);
    assert.equal(decision.authorized, true, `${id}: ${decision.reason} ${decision.detail}`);
  }

  // Feeds from the same publication share a source name so the per-source pool cap applies to the publication.
  const federalRegister = sources.filter((source) => source.id.startsWith('federal-register-'));
  assert.equal(federalRegister.length, 5);
  assert.ok(federalRegister.every((source) => source.name === 'Federal Register'));
  const arxiv = sources.filter((source) => source.id.startsWith('arxiv-'));
  assert.equal(arxiv.length, 3);
  assert.ok(arxiv.every((source) => source.name === 'arXiv'));
  // arXiv authorizes metadata only, so its feeds are abstract-scoped and never produce a local memo.
  assert.ok(arxiv.every((source) => source.text_scope === 'abstract'));
  const feeds = activeRegistryFeeds(sources, NOW);
  assert.ok(feeds.filter((feed) => feed.sourceRegistryId.startsWith('arxiv-')).every((feed) => feed.textScope === 'abstract'));
  assert.ok(feeds.filter((feed) => !feed.sourceRegistryId.startsWith('arxiv-')).every((feed) => feed.textScope === ''));

  // Link-only candidates never authorize text.
  for (const source of sources.filter((entry) => entry.text_use_basis === 'unreviewed')) {
    assert.equal(source.allow_text_use, false, `${source.id} is unreviewed and must not authorize text`);
    assert.equal(active.has(source.id), false, `${source.id} must not be fetched`);
  }
});
