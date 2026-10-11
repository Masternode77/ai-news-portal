import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  RELATED_STORY_CONTAMINATION_REASON,
  decodeHtmlEntities,
  detectRelatedStoryContamination,
} from '../scripts/lib/related-story-contamination.mjs';
import {
  analyzeSourceExtractionFailClosed,
  sourceExtractionPassesLongformGate,
  sourceExtractionPassesPublicGate,
} from '../scripts/lib/source-extraction-fail-closed.mjs';
import { ARTICLE_PAGE_QUALITY_THRESHOLD, analyzeExtractionQuality, qualityGateReason } from '../scripts/lib/quality-gate.mjs';
import { fetchArticleExtraction } from '../scripts/lib/source-fetch.mjs';
import { buildContentExtractionState } from '../scripts/lib/content.mjs';
import { validateExtractionArtifact } from '../scripts/lib/extraction-artifact.mjs';
import { PUBLIC_CONTENT_TIERS, routePublicContentTier } from '../scripts/lib/public-content-tier-router.mjs';

const FIXTURE_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'related-story-contamination');
const CONTAMINATED_FIXTURES = [
  'hpcwire-nvidia-500b-financing.json',
  'hpcwire-qunnect-monarch.json',
  'hpcwire-eaton-infleqtion.json',
];

function loadFixture(name) {
  return JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, name), 'utf8'));
}

function qualityFor(fixture) {
  return analyzeExtractionQuality({
    title: fixture.title,
    articleText: fixture.articleText,
    fallbackSnippet: fixture.snippet,
    sourceUrl: fixture.sourceUrl,
    sourceDomainAdapter: 'generic',
  });
}

for (const name of CONTAMINATED_FIXTURES) {
  test(`blocks long-form generation for the stored teaser-only extract ${name}`, () => {
    const fixture = loadFixture(name);

    // The stored QA from the 2026-08 pipeline passed this extract.
    assert.ok(fixture.stored_extraction_qa.extraction_quality_score >= ARTICLE_PAGE_QUALITY_THRESHOLD);
    assert.equal(fixture.stored_extraction_qa.sentence_completion_score, 1);
    assert.equal(fixture.stored_extraction_qa.boilerplate_ratio, 0);

    const contamination = detectRelatedStoryContamination({ title: fixture.title, text: fixture.articleText });
    assert.equal(contamination.detected, true);
    assert.equal(contamination.reason, RELATED_STORY_CONTAMINATION_REASON);
    assert.ok(contamination.teaser_fragment_count >= 9);
    assert.ok(contamination.teaser_fragment_ratio >= 0.8);
    assert.ok(contamination.consecutive_clipped_fragments >= 3);

    const failClosed = analyzeSourceExtractionFailClosed(fixture);
    assert.equal(failClosed.can_generate_longform, false);
    assert.equal(failClosed.extraction_qa.can_generate_longform, false);
    assert.equal(failClosed.extraction_qa.public_publishable, false);
    assert.equal(failClosed.extraction_qa.related_story_contamination_detected, true);
    assert.ok(failClosed.extraction_qa.block_reasons.includes(RELATED_STORY_CONTAMINATION_REASON));
    assert.ok(failClosed.reasons.includes(RELATED_STORY_CONTAMINATION_REASON));

    const longformGate = sourceExtractionPassesLongformGate(fixture);
    assert.equal(longformGate.ok, false);
    assert.ok(longformGate.block_reasons.includes(RELATED_STORY_CONTAMINATION_REASON));
    assert.equal(sourceExtractionPassesPublicGate(fixture).ok, false);

    const qa = qualityFor(fixture);
    assert.equal(qa.related_story_contamination_detected, true);
    assert.ok(qa.related_story_contamination_score >= 0.8);
    assert.ok(qa.extraction_quality_reasons.includes(RELATED_STORY_CONTAMINATION_REASON));
    assert.ok(qa.extraction_quality_score < ARTICLE_PAGE_QUALITY_THRESHOLD);
    assert.equal(
      qualityGateReason({ ...fixture, extraction_quality_score: qa.extraction_quality_score, extraction_qa: qa }),
      `fail_closed: ${RELATED_STORY_CONTAMINATION_REASON}`,
    );

    // The item survives as a card that points at the source, nothing more.
    const tier = routePublicContentTier(fixture);
    assert.equal(tier.tier, PUBLIC_CONTENT_TIERS.SIGNAL_CARD);
    assert.equal(tier.detailPage, false);
    assert.ok(tier.reasons.includes('dirty_extraction'));
    assert.ok(tier.reasons.includes('source_only_due_dirty_extraction'));
  });
}

test('keeps a clean press-release extract eligible for long-form generation', () => {
  const fixture = loadFixture('clean-press-release-extract.json');

  const contamination = detectRelatedStoryContamination({ title: fixture.title, text: fixture.articleText });
  assert.equal(contamination.detected, false);
  assert.equal(contamination.reason, null);
  assert.equal(contamination.clipped_fragment_count, 0);

  const failClosed = analyzeSourceExtractionFailClosed(fixture);
  assert.equal(failClosed.extraction_qa.can_generate_longform, true);
  assert.equal(failClosed.extraction_qa.public_publishable, true);
  assert.equal(failClosed.extraction_qa.related_story_contamination_detected, false);
  assert.deepEqual(failClosed.extraction_qa.block_reasons, []);
  assert.equal(sourceExtractionPassesLongformGate(fixture).ok, true);

  const qa = qualityFor(fixture);
  assert.equal(qa.related_story_contamination_detected, false);
  assert.ok(!qa.extraction_quality_reasons.includes(RELATED_STORY_CONTAMINATION_REASON));
  assert.ok(qa.extraction_quality_score >= ARTICLE_PAGE_QUALITY_THRESHOLD);
  assert.equal(qualityGateReason({ ...fixture, extraction_quality_score: qa.extraction_quality_score, extraction_qa: qa }), null);
  assert.equal(routePublicContentTier(fixture).tier, PUBLIC_CONTENT_TIERS.LONGFORM_ANALYSIS);
});

test('decodes HTML entities before judging clipped fragments', () => {
  assert.equal(decodeHtmlEntities('we&rsquo;re &#8230; &#x2026; &amp;hellip; &unknown;'), 'we’re … … &hellip; &unknown;');

  const fixture = loadFixture('hpcwire-nvidia-500b-financing.json');
  const encoded = fixture.articleText.replace(/\.{4}/g, '.&hellip;').replace(/\.{3}/g, '&hellip;');
  assert.ok(!/\.{3}/.test(encoded));

  const contamination = detectRelatedStoryContamination({ title: fixture.title, text: encoded });
  assert.equal(contamination.detected, true);
  assert.ok(contamination.clipped_fragment_count >= 9);

  const longformGate = sourceExtractionPassesLongformGate({ ...fixture, articleText: encoded });
  assert.equal(longformGate.ok, false);
  assert.ok(longformGate.block_reasons.includes(RELATED_STORY_CONTAMINATION_REASON));
});

test('catches headline-glued teasers when no ellipsis survives', () => {
  const fixture = loadFixture('hpcwire-qunnect-monarch.json');
  const unclipped = decodeHtmlEntities(fixture.articleText).replace(/\.{3,}/g, '.').replace(/…/g, '.');
  assert.ok(!/\.{3}|…/.test(unclipped));

  const contamination = detectRelatedStoryContamination({ title: fixture.title, text: unclipped });
  assert.equal(contamination.detected, true);
  assert.equal(contamination.clipped_fragment_count, 0);
  assert.ok(contamination.headline_glued_count >= 4);
  assert.ok(contamination.teaser_fragment_ratio >= 0.5);

  const longformGate = sourceExtractionPassesLongformGate({ ...fixture, articleText: unclipped });
  assert.equal(longformGate.ok, false);
  assert.ok(longformGate.block_reasons.includes(RELATED_STORY_CONTAMINATION_REASON));
  assert.ok(!longformGate.block_reasons.includes('ellipsis_truncation_artifact'));
});

test('does not flag a feed body whose sub-headings are glued to full paragraphs', () => {
  const feedBody = [
    'The regional summit in Austin on July 24 gathered leaders from the utility, two transmission developers, three colocation operators, and the state grid regulator.',
    'Held during the legislative recess, the event produced announcements spanning substation delivery, large-load tariffs, battery procurement, and interconnection study timelines.',
    'Austin Utility and Ridgeway Transmission Target 1.5 GW of New Load Austin Utility and Ridgeway Transmission signed letters of intent covering three substations, two transmission corridors, and a shared battery procurement program that the utility expects to tender in the fourth quarter.',
    'Colocation Operators Commit to Flexible Load Agreements The three operators said they would curtail up to 15 percent of campus load during grid emergencies in exchange for faster energization dates on the second phase.',
    'The regulator said the tariff docket would re…',
  ].join(' ');

  const contamination = detectRelatedStoryContamination({ title: 'Austin summit pairs new load with flexible agreements', text: feedBody });
  assert.equal(contamination.detected, false);
  assert.ok(contamination.teaser_fragment_count <= 2);
  assert.equal(contamination.clipped_fragment_count, 0);
});

test('counts a clipped tail that closes a short sidebar run after a real body', () => {
  const body = [
    'Lakeside Utility signed a 400 MW interconnection agreement with the developer of a data center campus on the north shore.',
    'The agreement names the substation, the transmission corridor, and the transformer delivery dates that control the first phase.',
    'The developer will fund the substation upgrade and recover the cost through a large-load tariff approved in June.',
    'Colocation customers on the campus will accept curtailment during grid emergencies, which shortened the study timeline.',
    'The second phase depends on equipment that has not yet been ordered, so transformer deliveries remain the decision point.',
  ].join(' ');
  const sidebar = [
    'Ridgeway Transmission has filed a corridor plan that would add two 345 kV lines to the&hellip;',
    'The state utility said nine suppliers answered its tender for 600 MWh of storage, with awards&hellip;',
    'Developers who signed firm service agreements before the tariff docket opened are finding that&hellip;',
  ].join(' ');
  const title = 'Lakeside Utility Signs 400 MW Interconnection Agreement';

  const contamination = detectRelatedStoryContamination({ title, text: `${body} ${sidebar}` });
  assert.equal(contamination.detected, true);
  assert.equal(contamination.clipped_fragment_count, 3);
  assert.equal(contamination.consecutive_clipped_fragments, 3);

  const longformGate = sourceExtractionPassesLongformGate({ title, articleText: `${body} ${sidebar}` });
  assert.equal(longformGate.ok, false);
  assert.ok(longformGate.block_reasons.includes(RELATED_STORY_CONTAMINATION_REASON));

  // A feed body whose only clipped segment is its own truncated tail stays clean.
  const feedBody = `${body} The regulator said the tariff docket would re\u2026`;
  assert.equal(detectRelatedStoryContamination({ title, text: feedBody }).detected, false);
});

test('does not mistake an extract that repeats its own headline for sidebar teasers', () => {
  const title = 'Ridgeway Transmission Opens 400 MW Substation for Lakeside Data Center Campus';
  const text = `${title} matters most for capacity planning, supplier leverage, and the timing of hardware refresh cycles. `.repeat(6);

  const contamination = detectRelatedStoryContamination({ title, text });
  assert.equal(contamination.detected, false);
  assert.equal(contamination.headline_glued_count, 0);
});

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

const sidebarOnlyHtml = `
  <html>
    <body>
      <article>
        <h1>Lakeside Utility Signs 400 MW Interconnection Agreement</h1>
        <div class="related-posts">
          <p>Ridgeway Transmission Files Corridor Plan With Regulators Ridgeway Transmission has filed a corridor plan that would add two 345 kV lines to the&hellip;</p>
          <p>Battery Procurement Tender Draws Nine Bidders The state utility said nine suppliers answered its tender for 600 MWh of storage, with awards expected&hellip;</p>
          <p>Why Large-Load Tariffs Are Rewriting Campus Financing Developers who signed firm service agreements before the tariff docket opened are finding that&hellip;</p>
          <p>Colocation Operators Pledge Flexible Load Three operators told the regulator they would curtail campus load during emergencies in exchange for&hellip;</p>
          <p>Inside the Substation Delivery Backlog Transformer lead times stretched past 30 months this spring, and utilities are now sequencing projects&hellip;</p>
          <p>Prior to the regional grid conference in Austin, the utility's planning chief outlined how interconnection studies will be&hellip;</p>
        </div>
      </article>
    </body>
  </html>
`;

const bodyHtml = `
  <html>
    <body>
      <article>
        <p>Lakeside Utility signed a 400 MW interconnection agreement with the developer of a data center campus on the north shore, with energization in two phases.</p>
        <p>The agreement names the substation, the transmission corridor, and the transformer delivery dates that control the first phase, which the utility expects in late 2027.</p>
        <p>The developer will fund the substation upgrade and recover the cost through a large-load tariff that the regulator approved in June after a contested docket.</p>
        <p>Colocation customers on the campus will accept curtailment during grid emergencies, and the utility said that flexibility shortened the study timeline by six months.</p>
        <p>The decision point for readers is whether transformer deliveries hold, because the second phase depends on equipment that has not yet been ordered.</p>
      </article>
    </body>
  </html>
`;

test('marks a fetched page whose article element is the related-story sidebar as a hard block', async () => {
  const sources = [source('lakeside-test', 'Lakeside Test', 'example-wire.com')];
  const item = {
    url: 'https://www.example-wire.com/2026/08/10/lakeside-utility-signs-400-mw-interconnection-agreement/',
    title: 'Lakeside Utility Signs 400 MW Interconnection Agreement',
    snippet: 'Lakeside Utility signed a 400 MW interconnection agreement with a data center developer.',
    sourceRegistryId: 'lakeside-test',
  };

  const contaminated = await fetchArticleExtraction({
    url: item.url,
    title: item.title,
    fallbackSnippet: item.snippet,
    sourceRegistryId: item.sourceRegistryId,
    sources,
    now: NOW,
    networkOptions: injectedHtml(sidebarOnlyHtml),
  });
  assert.equal(contaminated.extractionQa.source_domain_adapter, 'generic');
  assert.ok(contaminated.extractionQa.content_length > 500);
  assert.equal(contaminated.extractionQa.related_story_contamination_detected, true);
  assert.equal(contaminated.extractionQa.can_generate_longform, false);
  assert.ok(contaminated.extractionQa.block_reasons.includes(RELATED_STORY_CONTAMINATION_REASON));
  assert.ok(contaminated.extractionQa.extraction_quality_reasons.includes(RELATED_STORY_CONTAMINATION_REASON));
  assert.ok(contaminated.extractionQa.extraction_quality_score < ARTICLE_PAGE_QUALITY_THRESHOLD);

  const state = buildContentExtractionState(item, contaminated.articleText, contaminated.extractionQa);
  assert.equal(state.publicExtractionQa.public_publishable, false);
  assert.equal(state.publicExtractionQa.can_generate_longform, false);
  assert.ok(state.publicExtractionQa.block_reasons.includes(RELATED_STORY_CONTAMINATION_REASON));
  assert.equal(state.extractionArtifact.extraction_qa.can_generate_longform, false);
  assert.equal(validateExtractionArtifact(state.extractionArtifact).ok, false);

  const clean = await fetchArticleExtraction({
    url: item.url,
    title: item.title,
    fallbackSnippet: item.snippet,
    sourceRegistryId: item.sourceRegistryId,
    sources,
    now: NOW,
    networkOptions: injectedHtml(bodyHtml),
  });
  assert.equal(clean.extractionQa.related_story_contamination_detected, false);
  assert.equal(clean.extractionQa.can_generate_longform, undefined);
  assert.ok(!clean.extractionQa.extraction_quality_reasons.includes(RELATED_STORY_CONTAMINATION_REASON));
  assert.ok(clean.extractionQa.extraction_quality_score >= ARTICLE_PAGE_QUALITY_THRESHOLD);

  const cleanState = buildContentExtractionState(item, clean.articleText, clean.extractionQa);
  assert.equal(cleanState.publicExtractionQa.can_generate_longform, false);
  assert.equal(cleanState.publicExtractionQa.public_publishable, true);
  assert.ok(!cleanState.publicExtractionQa.block_reasons.includes(RELATED_STORY_CONTAMINATION_REASON));
});
