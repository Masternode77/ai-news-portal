import assert from 'node:assert/strict';
import test from 'node:test';
import Parser from 'rss-parser';
import {
  httpsItemUrl,
  hydrateSourceTextScope,
  parseFeedItem,
  publishedAtIso,
  repairFeedLink,
  selectPoolItems,
  textValue,
} from '../scripts/lib/fetch-feeds.mjs';
import { authorizedTextFallbackPool, columnCandidateRecords } from '../scripts/pipeline.mjs';
import { abstractOnlySource, selectColumnStory } from '../scripts/lib/authored-column-engine.mjs';
import { abstractOnlyCluster, selectEditorialSignals } from '../scripts/lib/editorial-selection-engine.mjs';
import { cleanScanItem, scanSourceItems } from '../scripts/lib/global-source-scan.mjs';
import { fixtureArticle } from './fixtures/authored-column-fixture.mjs';
import { classifyInfrastructureRelevance } from '../scripts/lib/relevance-classifier.mjs';
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
  const uncapped = selectEditorialSignals([{ ...cluster, representative_source: { ...scanned, source_text_scope: undefined } }]);
  assert.equal(uncapped.selected_for_analysis.length, 1);
  assert.equal(uncapped.selected_for_analysis[0].editorial_route, 'Featured Analysis');
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
  assert.equal(extractionQa.source_domain_adapter, 'federalregister');
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
