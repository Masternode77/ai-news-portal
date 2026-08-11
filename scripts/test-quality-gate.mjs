import assert from 'node:assert/strict';
import {
  ARTICLE_PAGE_QUALITY_THRESHOLD,
  analyzeExtractionQuality,
  scoreExtractionQuality,
  splitByArticleQualityGate,
} from './lib/quality-gate.mjs';
import { fetchArticleExtraction } from './lib/source-fetch.mjs';

const strongExtraction = [
  'A data center operator described a detailed shift in how new AI capacity is being connected to power markets.',
  'The report included operational context, customer timing, grid constraints, equipment dependencies, and market structure.',
  'That level of source extraction is enough to support a generated article page without relying only on the RSS snippet.',
  'Readers can understand what changed, why it matters, and which constraints will determine whether the capacity becomes useful.',
].join(' '.repeat(3)).repeat(8);

const weakExtraction = 'Short RSS snippet only.';

assert.ok(
  scoreExtractionQuality({
    title: 'Data center operator shifts AI capacity into power market trading',
    articleText: strongExtraction,
    fallbackSnippet: 'Brief fallback snippet.',
    sourceUrl: 'https://example.com/report',
    sourceDomainAdapter: 'generic',
  }) >= ARTICLE_PAGE_QUALITY_THRESHOLD
);

assert.ok(
  scoreExtractionQuality({
    title: 'Short RSS snippet',
    articleText: weakExtraction,
    fallbackSnippet: weakExtraction,
    sourceUrl: 'https://example.com/report',
  }) < ARTICLE_PAGE_QUALITY_THRESHOLD
);

const qa = analyzeExtractionQuality({
  title: 'Data Center Compliance in 2026: What Changed',
  articleText: [
    'Data Center Compliance in 2026: What Changed, What is Next, and How to Prepare.',
    'Want more Data Center Knowledge stories in your Google search results?',
    'Subscribe to our newsletter for related articles and market updates.',
    'Copyright 2026 TechTarget, Inc. d/b/a Informa TechTarget. All rights reserved.',
  ].join(' '),
  fallbackSnippet: 'Data center compliance update.',
  sourceUrl: 'https://www.datacenterknowledge.com/regulations/report',
  sourceDomainAdapter: 'datacenterknowledge',
});

assert.equal(qa.source_domain_adapter, 'datacenterknowledge');
assert.equal(qa.copyright_footer_detected, true);
assert.equal(qa.nav_or_cta_detected, true);
assert.ok(qa.boilerplate_ratio > 0);
assert.ok(qa.extraction_quality_score < ARTICLE_PAGE_QUALITY_THRESHOLD);
assert.ok(qa.extraction_quality_reasons.some((reason) => reason.includes('copyright_footer_detected')));

const NOW = new Date('2026-08-10T00:00:00.000Z');
function source(id, name, domain) {
  return {
    id,
    name,
    domain,
    article_hosts: `www.${domain}`,
    feed: `https://${domain}/feed`,
    status: 'active_feed',
    text_use_basis: 'licensed',
    terms_url: `https://${domain}/terms`,
    reviewed_at: '2026-08-01',
    allow_text_use: true,
  };
}

function injectedHtml(html) {
  return {
    resolveHost: async () => [{ address: '93.184.216.34', family: 4 }],
    request: async () => ({
      status: 200,
      headers: { 'content-type': 'text/html' },
      body: (async function* body() { yield Buffer.from(html); }()),
    }),
  };
}

const techcrunchHtml = `
  <html>
    <body>
      <article>
        <p>TechCrunch reported that a cloud infrastructure company expanded its accelerator capacity for enterprise inference workloads.</p>
        <p>The source described customer demand, deployment timing, power availability, and the operational work needed to bring new AI capacity online.</p>
        <p>The article also described which buyers benefit from faster provisioning and which operators remain exposed to delays in networking and facility readiness.</p>
        <p>The decision point for readers is whether the provider can turn the announced capacity into available clusters before customers shift workloads elsewhere.</p>
        <p>It gives enough operating context to judge the announcement against power, network, procurement, and customer migration constraints rather than treating the item as a generic AI product release.</p>
      </article>
    </body>
  </html>
`;

const adaptedExtraction = await fetchArticleExtraction({
  url: 'https://techcrunch.com/2026/05/17/cloud-capacity-report/',
  title: 'Cloud infrastructure company expands accelerator capacity',
  fallbackSnippet: 'Cloud capacity report.',
  sourceRegistryId: 'techcrunch-test',
  sources: [source('techcrunch-test', 'TechCrunch Test', 'techcrunch.com')],
  now: NOW,
  networkOptions: injectedHtml(techcrunchHtml),
});

assert.equal(adaptedExtraction.extractionQa.source_domain_adapter, 'techcrunch');
assert.ok(adaptedExtraction.extractionQa.content_length > 300);
assert.ok(adaptedExtraction.extractionQa.extraction_quality_score >= ARTICLE_PAGE_QUALITY_THRESHOLD);

const datacenterKnowledgeHtml = `
  <html>
    <body>
      <article>
        <p>Data Center Compliance in 2026: What Changed, What is Next, and How to Prepare.</p>
        <p>Want more Data Center Knowledge stories in your Google search results?</p>
        <p>Copyright 2026 TechTarget, Inc. d/b/a Informa TechTarget. All rights reserved.</p>
      </article>
    </body>
  </html>
`;

const footerExtraction = await fetchArticleExtraction({
  url: 'https://www.datacenterknowledge.com/regulations/compliance-report',
  title: 'Data Center Compliance in 2026: What Changed',
  fallbackSnippet: 'Data center compliance update.',
  sourceRegistryId: 'datacenterknowledge-test',
  sources: [source('datacenterknowledge-test', 'Data Center Knowledge Test', 'datacenterknowledge.com')],
  now: NOW,
  networkOptions: injectedHtml(datacenterKnowledgeHtml),
});

assert.equal(footerExtraction.extractionQa.source_domain_adapter, 'datacenterknowledge');
assert.equal(footerExtraction.extractionQa.copyright_footer_detected, true);
assert.ok(!footerExtraction.articleText.includes('Copyright 2026'));
assert.ok(footerExtraction.extractionQa.extraction_quality_score < ARTICLE_PAGE_QUALITY_THRESHOLD);

const { publishable, blocked } = splitByArticleQualityGate([
  {
    id: 'good',
    title: 'Good extraction',
    articleText: strongExtraction,
    extraction_quality_score: 0.91,
    extraction_qa: analyzeExtractionQuality({
      title: 'Good extraction',
      articleText: strongExtraction,
      fallbackSnippet: 'Brief fallback snippet.',
      sourceUrl: 'https://example.com/report',
    }),
  },
  {
    id: 'bad',
    title: 'Bad extraction',
    articleText: weakExtraction,
    extraction_quality_score: 0.2,
    extraction_qa: qa,
  },
]);

assert.equal(publishable.length, 1);
assert.equal(publishable[0].id, 'good');
assert.equal(blocked.length, 1);
assert.equal(blocked[0].id, 'bad');
assert.equal(blocked[0].qualityGateBlocked, true);
assert.equal(blocked[0].articlePagePublished, false);
assert.match(blocked[0].qualityGateReason, /fail_closed/);
assert.match(blocked[0].qualityGateReason, /legal_boilerplate_detected|copyright_footer_detected/);

console.log('quality gate test passed');
