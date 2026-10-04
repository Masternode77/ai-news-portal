import assert from 'node:assert/strict';
import test from 'node:test';
import {
  authoredInsightEligible,
  columnSourceLongformEligible,
  generateAuthoredColumn,
  normalizeAuthoredBody,
  selectColumnStory,
  selectColumnStoryWithDiagnostics,
  verificationFeedback,
} from '../scripts/lib/authored-column-engine.mjs';
import {
  authoredColumnQualityResult,
  recentHeadingsFromColumns,
  recentLeadsFromColumns,
} from '../scripts/lib/authored-column-policy.mjs';
import { buildColumnFigures, numericLedgerClaims } from '../scripts/lib/authored-column-figures.mjs';
import { buildClaimLedger } from '../scripts/lib/claim-ledger.mjs';
import { headingSequence } from '../scripts/lib/visible-body-length.mjs';
import { resetLlmUsageForTests } from '../scripts/lib/llm-budget.mjs';
import { createExtractionArtifact } from '../scripts/lib/extraction-artifact.mjs';
import {
  SOURCE_TEXT,
  CLOSING_HEADING,
  COUNTER_HEADING,
  FIXTURE_SOURCE,
  STANCE_JSON,
  essayBody,
  essayJson,
  fixtureArticle,
} from './fixtures/authored-column-fixture.mjs';

const FIXTURE_SOURCES = [FIXTURE_SOURCE];

function stubModel() {
  let call = 0;
  return async () => {
    call += 1;
    if (call === 1) return STANCE_JSON;
    return essayJson();
  };
}

function fixtureLedger() {
  const article = fixtureArticle();
  return buildClaimLedger({
    cluster_id: 'authored_wire-001',
    representative_source: {
      source_url: article.sourceUrl,
      source_name: article.source,
      title: article.title,
      cleaned_text: article.cleaned_source_text,
    },
    supporting_sources: [],
  }, article.id);
}

test('engine skips cleanly without an api key', async () => {
  resetLlmUsageForTests();
  delete process.env.OPENROUTER_API_KEY;
  const result = await generateAuthoredColumn({ candidates: [fixtureArticle()], pool: [], state: {}, now: new Date() });
  assert.equal(result.column, null);
  assert.equal(result.skipReason, 'llm_disabled');
});

test('story selection enforces relevance and fact floors', () => {
  const weak = fixtureArticle({ id: 'weak', infrastructure_relevance_score: 0.5 });
  assert.equal(selectColumnStory({ candidates: [weak], pool: [], sources: FIXTURE_SOURCES }), null);
  const strong = selectColumnStory({ candidates: [fixtureArticle()], pool: [], sources: FIXTURE_SOURCES });
  assert.ok(strong);
  assert.equal(strong.article.id, 'wire-001');
});

test('story selection fails closed on source rights and extraction QA with diagnostics', () => {
  const article = fixtureArticle();
  const deniedSource = { ...FIXTURE_SOURCE, allow_text_use: false };
  const denied = selectColumnStoryWithDiagnostics({ candidates: [article], sources: [deniedSource] });
  assert.equal(denied.selection, null);
  assert.equal(denied.diagnostics.counts.text_rights_unauthorized, 1);

  const extractionBlocked = fixtureArticle({
    id: 'extraction-blocked',
    extraction_qa: { public_publishable: true, can_generate_longform: false, block_reasons: ['cleaned_source_text_below_1200'] },
  });
  assert.equal(columnSourceLongformEligible(extractionBlocked), false);
  const result = selectColumnStoryWithDiagnostics({ candidates: [extractionBlocked], sources: FIXTURE_SOURCES });
  assert.equal(result.selection, null);
  assert.equal(result.diagnostics.counts.extraction_ineligible, 1);
});

test('authored selection allows only-named-companies policy exception with a named regulatory actor', () => {
  const commissionSource = {
    ...FIXTURE_SOURCE,
    id: 'ec-press-corner',
    name: 'European Commission',
    domain: 'ec.europa.eu',
    feed: 'https://ec.europa.eu/feed',
    terms_url: 'https://ec.europa.eu/terms',
  };
  const commission = fixtureArticle({
    id: 'commission-policy',
    sourceRegistryId: commissionSource.id,
    source: commissionSource.name,
    sourceUrl: 'https://ec.europa.eu/commission/presscorner/detail/en/ip_26_1667',
    primary_category: 'Policy & Siting',
    article_type: 'Policy / Regulation',
    infrastructure_layer: 'Policy',
    expert_insight_complete: false,
    expert_insight: {
      ...fixtureArticle().expert_insight,
      named_companies: [],
      expert_insight_complete: false,
      expert_insight_missing_fields: ['named_companies'],
    },
  });
  assert.equal(authoredInsightEligible(commission), true);
  assert.equal(selectColumnStory({ candidates: [commission], sources: [commissionSource] })?.article.id, commission.id);

  const anonymous = {
    ...commission,
    id: 'anonymous-policy',
    sourceRegistryId: FIXTURE_SOURCE.id,
    source: 'Grid Journal',
    sourceUrl: 'https://example.com/anonymous-policy',
  };
  assert.equal(authoredInsightEligible(anonymous), false);
  assert.equal(selectColumnStory({ candidates: [anonymous], sources: FIXTURE_SOURCES }), null);
});

test('corroborating sources must independently pass rights, scope, extraction, and evidence gates', () => {
  const source = (id, domain, extra = {}) => ({
    ...FIXTURE_SOURCE,
    id,
    name: id,
    domain,
    feed: `https://${domain}/feed`,
    terms_url: `https://${domain}/terms`,
    ...extra,
  });
  const supportingArticle = (id, sourceRegistryId, domain, extra = {}) => fixtureArticle({
    id,
    sourceRegistryId,
    source: sourceRegistryId,
    sourceUrl: `https://${domain}/northline-dakota-grid-campus`,
    title: `Northline Dakota grid campus update ${id}`,
    ...extra,
  });
  const eligibleSource = source('eligible-support', 'eligible.example');
  const deniedSource = source('denied-support', 'denied.example', { allow_text_use: false });
  const abstractSource = source('abstract-support', 'abstract.example', { text_scope: 'abstract' });
  const extractionSource = source('extraction-support', 'extraction.example');
  const eligible = supportingArticle('eligible', eligibleSource.id, eligibleSource.domain);
  const denied = supportingArticle('denied', deniedSource.id, deniedSource.domain);
  const abstract = supportingArticle('abstract', abstractSource.id, abstractSource.domain, { source_text_scope: 'abstract' });
  const extractionBlocked = supportingArticle('extraction', extractionSource.id, extractionSource.domain, {
    extraction_qa: { public_publishable: true, can_generate_longform: false, block_reasons: ['cleaned_source_text_below_1200'] },
  });
  const result = selectColumnStoryWithDiagnostics({
    candidates: [fixtureArticle()],
    pool: [eligible, denied, abstract, extractionBlocked],
    sources: [FIXTURE_SOURCE, eligibleSource, deniedSource, abstractSource, extractionSource],
  });
  assert.equal(result.selection?.article.id, 'wire-001');
  assert.deepEqual(result.selection.corroborating.map((article) => article.id), ['eligible']);
});

test('selector reports clean extraction with unusable evidence separately', () => {
  const genericText = [
    'The organization published its quarterly administrative report after a scheduled board meeting and invited written comments from interested readers.',
    'The report describes staffing updates, document retention practices, meeting dates, and internal review procedures for the coming year.',
    'Officials said the timetable remains provisional until the next board vote and that revised forms will be posted after legal review.',
    'The notice lists filing dates, contact information, public meeting procedures, and the expected sequence for receiving formal comments.',
    'No substantive program, purchase, delivery commitment, or measurable implementation change is described in the notice.',
    'The organization will publish another administrative update after the consultation period closes and staff prepare a response memorandum.',
    'Readers are directed to the official record for the complete schedule and for any later corrections to procedural dates in the report.',
    'The board may revise the reporting template at a future meeting, but the notice makes no commitment about the substance of that revision.',
    'Staff will catalog responses, prepare minutes, and circulate a summary before the next regularly scheduled administrative session.',
    'The publication records a procedural step and does not establish a commercial transaction, delivery milestone, or substantive decision.',
  ].map((sentence) => `Compute Current is keeping this internal note out of publication because ${sentence[0].toLowerCase()}${sentence.slice(1)}`).join(' ');
  const article = fixtureArticle({
    id: 'unclean-evidence',
    title: 'Quarterly administrative reporting update',
    cleaned_source_text: genericText,
    articleText: genericText,
    contentText: genericText,
    primary_category: '',
    category: '',
    infrastructure_layer: '',
  });
  assert.equal(columnSourceLongformEligible(article), true);
  const result = selectColumnStoryWithDiagnostics({ candidates: [article], sources: FIXTURE_SOURCES });
  assert.equal(result.selection, null);
  assert.equal(result.diagnostics.counts.unclean_evidence, 1);
});

test('no qualifying result persists bounded selection diagnostics for automation', async () => {
  const state = {};
  const result = await generateAuthoredColumn({
    candidates: [fixtureArticle()],
    state,
    now: new Date('2026-10-04T02:33:24.486Z'),
    sources: [{ ...FIXTURE_SOURCE, allow_text_use: false }],
    callModel: async () => { throw new Error('model must not be called'); },
  });
  assert.equal(result.skipReason, 'no_qualifying_story');
  assert.equal(result.selectionDiagnostics.counts.text_rights_unauthorized, 1);
  assert.equal(state.authored.lastSelection.outcome, 'no_qualifying_story');
  assert.deepEqual(state.authored.lastSelection.diagnostics, result.selectionDiagnostics);
});

test('artifact-only source survives selection, model payload and final quality verification', async () => {
  resetLlmUsageForTests();
  process.env.OPENROUTER_API_KEY = 'test-key';
  process.env.AUTHORED_MIN_WORDS = '700';
  process.env.AUTHORED_MIN_CHARS = '4200';
  try {
    const state = {};
    const now = new Date('2026-08-23T09:00:00Z');
    const source = fixtureArticle();
    source.extraction_artifact = createExtractionArtifact({ sourceUrl: source.sourceUrl, cleanedExtractedText: source.articleText, extractionQa: { ...source.extraction_qa, sentence_completion_score: 1 } });
    delete source.cleaned_source_text;
    delete source.articleText;
    delete source.contentText;
    source.snippet = 'This short feed snippet must not replace the saved evidence.';
    const respond = stubModel();
    const result = await generateAuthoredColumn({
      candidates: [source],
      pool: [],
      recentRecords: [],
      existingColumns: [],
      state,
      now,
      sources: FIXTURE_SOURCES,
      callModel: async request => {
        const payload = JSON.parse(request.userPrompt);
        if (payload.evidence) assert.ok(payload.evidence.verified_claims.some(claim => claim.value === 200));
        return respond(request);
      },
    });

    assert.ok(result.column, `expected a column, got ${JSON.stringify(result)}`);
    const column = result.column;
    assert.equal(column.content_origin, 'authored');
    assert.equal(column.author.name, 'Josh Jiwoon Inn');
    assert.ok(column.slug.includes('2026-08-23'));
    assert.ok(column.expertLensFull.finalArticleBody.includes(CLOSING_HEADING));
    assert.equal(column.authored_quality.ok, true);
    assert.ok(column.authored_quality.metrics.words >= 700);
    assert.ok(Array.isArray(column.figures), 'expected figures on the record');
    assert.ok(column.figures.length >= 1 && column.figures.length <= 3, `figure count ${column.figures.length}`);
    assert.ok(column.figures[0].items.length >= 1);
    assert.ok(column.figures[0].title.length >= 8);
    assert.equal(column.authored_quality.metrics.figure_count, column.figures.length);
    assert.equal(state.authored.columnsByDay['2026-08-23'], 1);
    assert.equal(state.authored.lastFailure, null);
  } finally {
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.AUTHORED_MIN_WORDS;
    delete process.env.AUTHORED_MIN_CHARS;
  }
});

test('verification failure publishes nothing and records the reason', async () => {
  resetLlmUsageForTests();
  process.env.OPENROUTER_API_KEY = 'test-key';
  try {
    const state = {};
    let calls = 0;
    const badModel = async () => {
      calls += 1;
      if (calls === 1) return STANCE_JSON;
      return JSON.stringify({ headline: 'Too Short To Publish Anywhere Near The Bar', deck: 'A deck that is long enough to pass the standfirst window but backed by a body that is far too short.', body: 'One tiny paragraph that fails every structural check.' });
    };
    const result = await generateAuthoredColumn({
      candidates: [fixtureArticle()],
      pool: [],
      state,
      now: new Date(),
      sources: FIXTURE_SOURCES,
      callModel: badModel,
    });
    assert.equal(result.column, null);
    assert.match(result.failure, /^verify:/);
    assert.ok(state.authored.lastFailure);
    assert.ok(calls >= 3, 'expected a retry voice pass before giving up');
  } finally {
    delete process.env.OPENROUTER_API_KEY;
  }
});

test('story-key dedupe skips stories already covered', async () => {
  resetLlmUsageForTests();
  process.env.OPENROUTER_API_KEY = 'test-key';
  try {
    const result = await generateAuthoredColumn({
      candidates: [fixtureArticle()],
      pool: [],
      existingColumns: [{ story_key: 'https://example.com/northline-dakota', stance: { thesis: 'prior' } }],
      state: {},
      now: new Date(),
      sources: FIXTURE_SOURCES,
      callModel: stubModel(),
    });
    assert.equal(result.column, null);
    assert.equal(result.skipReason, 'no_qualifying_story');
  } finally {
    delete process.env.OPENROUTER_API_KEY;
  }
});

test('daily cap and minimum gap are enforced', async () => {
  resetLlmUsageForTests();
  process.env.OPENROUTER_API_KEY = 'test-key';
  try {
    const now = new Date('2026-08-23T09:00:00Z');
    const capped = await generateAuthoredColumn({
      candidates: [fixtureArticle()],
      pool: [],
      state: { authored: { lastColumnAt: '2026-08-23T01:00:00Z', columnsByDay: { '2026-08-23': 3 }, recentStoryKeys: [] } },
      now,
      callModel: stubModel(),
    });
    assert.match(capped.skipReason, /^daily_cap_reached/);

    const gapped = await generateAuthoredColumn({
      candidates: [fixtureArticle()],
      pool: [],
      state: { authored: { lastColumnAt: '2026-08-23T07:30:00Z', columnsByDay: { '2026-08-23': 1 }, recentStoryKeys: [] } },
      now,
      callModel: stubModel(),
    });
    assert.match(gapped.skipReason, /^min_gap_not_reached/);
  } finally {
    delete process.env.OPENROUTER_API_KEY;
  }
});

test('normalizeAuthoredBody converts markdown habits into gate-visible structure', () => {
  const markdownBody = essayBody()
    .split('\n\n')
    .map((block) => (headingSequence(block).length ? `## ${block}` : block))
    .join('\n\n');
  const normalized = normalizeAuthoredBody(markdownBody);
  assert.ok(headingSequence(normalized).length >= 4, 'markdown headings should be recognized after normalization');
  assert.ok(normalized.includes(CLOSING_HEADING));
  assert.ok(!normalized.includes('##'));

  const glued = 'The Grid Answers First\nA paragraph glued to its heading by a single newline, which hides the heading from the block splitter entirely.';
  const isolated = normalizeAuthoredBody(glued);
  assert.deepEqual(headingSequence(isolated), ['The Grid Answers First']);

  const decorated = normalizeAuthoredBody(`**${COUNTER_HEADING}**\n\nPlain paragraph with **bold** and \`code\` markers that must not survive.`);
  assert.deepEqual(headingSequence(decorated), [COUNTER_HEADING]);
  assert.ok(!decorated.includes('**') && !decorated.includes('`'));

  const fenced = normalizeAuthoredBody('```\nSignals Worth Tracking\n```\n\nBody text.');
  assert.ok(!fenced.includes('```'));
});

test('normalizeAuthoredBody leaves a compliant body unchanged', () => {
  const body = essayBody();
  assert.equal(normalizeAuthoredBody(body), body.trim());
});

test('verificationFeedback translates reason codes into actionable directives', () => {
  const feedback = verificationFeedback([
    'fewer_than_4_sections',
    'legacy_template_heading:On My Watchlist',
    'heading_reused_recently:The Grid Answers First',
    'lead_repeats_recent_column',
    'unsupported_numeric_claims:2.5 GW,40 percent',
    'copied_source_sentence',
    'deck_length_out_of_range',
    'some_unknown_code',
  ]);
  assert.equal(feedback.length, 8);
  assert.match(feedback[0], /standalone plain-text line/);
  assert.match(feedback[1], /permanently retired/);
  assert.match(feedback[2], /The Grid Answers First/);
  assert.match(feedback[3], /different device/);
  assert.match(feedback[4], /2\.5 GW,40 percent/);
  assert.match(feedback[5], /own words/);
  assert.match(feedback[6], /80 and 240 characters/);
  assert.equal(feedback[7], 'some_unknown_code');
});

test('quality policy names the offending unsupported numbers', () => {
  const result = authoredColumnQualityResult({
    body: essayBody(),
    title: 'The Dakota Grid Deal Is A Utility Execution Story Now',
    deck: 'Northline Power secured 200 MW for its Dakota AI campus, and the anchor tenant just bought schedule risk priced as energy risk.',
    ledgerClaims: [],
    sourceText: SOURCE_TEXT,
  });
  assert.equal(result.ok, false);
  const claimReason = result.reasons.find((reason) => reason.startsWith('unsupported_numeric_claims'));
  assert.ok(claimReason, 'expected an unsupported numeric claims reason');
  assert.match(claimReason, /unsupported_numeric_claims:.*200 MW/);
});

test('quality policy bans retired template headings outright', () => {
  const body = essayBody().replace(CLOSING_HEADING, 'On My Watchlist');
  const result = authoredColumnQualityResult({
    body,
    title: 'The Dakota Grid Deal Is A Utility Execution Story Now',
    deck: 'Northline Power secured 200 MW for its Dakota AI campus, and the anchor tenant just bought schedule risk priced as energy risk.',
    ledgerClaims: [],
    sourceText: SOURCE_TEXT,
  });
  assert.equal(result.ok, false);
  assert.ok(result.reasons.some((reason) => reason.startsWith('legacy_template_heading')), result.reasons.join('|'));
});

test('quality policy rejects headings and leads that echo recent columns', () => {
  const priorColumn = { expertLensFull: { finalArticleBody: essayBody() } };
  const recentHeadings = recentHeadingsFromColumns([priorColumn]);
  const recentLeads = recentLeadsFromColumns([priorColumn]);
  assert.ok(recentHeadings.includes(CLOSING_HEADING));
  assert.ok(recentLeads.length >= 1);

  const result = authoredColumnQualityResult({
    body: essayBody(),
    title: 'The Dakota Grid Deal Is A Utility Execution Story Now',
    deck: 'Northline Power secured 200 MW for its Dakota AI campus, and the anchor tenant just bought schedule risk priced as energy risk.',
    ledgerClaims: [],
    sourceText: SOURCE_TEXT,
    recentHeadings,
    recentLeads,
  });
  assert.equal(result.ok, false);
  assert.ok(result.reasons.some((reason) => reason.startsWith('heading_reused_recently')), result.reasons.join('|'));
  assert.ok(result.reasons.includes('lead_repeats_recent_column'), result.reasons.join('|'));

  const fresh = authoredColumnQualityResult({
    body: essayBody(),
    title: 'The Dakota Grid Deal Is A Utility Execution Story Now',
    deck: 'Northline Power secured 200 MW for its Dakota AI campus, and the anchor tenant just bought schedule risk priced as energy risk.',
    ledgerClaims: [],
    sourceText: SOURCE_TEXT,
    recentHeadings: ['A Totally Different Prior Heading'],
    recentLeads: ['A prior lead about an unrelated substation dispute in Ohio.'],
  });
  assert.ok(!fresh.reasons.some((reason) => reason.startsWith('heading_reused_recently')));
  assert.ok(!fresh.reasons.includes('lead_repeats_recent_column'));
});

test('quality policy enforces the figure mandate when figures are provided', () => {
  const base = {
    body: essayBody(),
    title: 'The Dakota Grid Deal Is A Utility Execution Story Now',
    deck: 'Northline Power secured 200 MW for its Dakota AI campus, and the anchor tenant just bought schedule risk priced as energy risk.',
    ledgerClaims: [],
    sourceText: SOURCE_TEXT,
  };
  const missing = authoredColumnQualityResult({ ...base, figures: [] });
  assert.ok(missing.reasons.includes('figures_missing'));
  const excess = authoredColumnQualityResult({ ...base, figures: [{}, {}, {}, {}] });
  assert.ok(excess.reasons.includes('figures_excess'));
  const skipped = authoredColumnQualityResult({ ...base });
  assert.ok(!skipped.reasons.some((reason) => reason.startsWith('figures_')));
  assert.equal(skipped.metrics.figure_count, 0);
});

test('buildColumnFigures constructs 1-3 deterministic figures from the ledger', () => {
  const ledger = fixtureLedger();
  assert.ok(numericLedgerClaims(ledger).length >= 3);
  const { figures, source } = buildColumnFigures({
    ledger,
    stance: JSON.parse(STANCE_JSON),
    headline: 'The Dakota Grid Deal Is A Utility Execution Story Now',
    sectionCount: 6,
  });
  assert.equal(source, 'deterministic');
  assert.ok(figures.length >= 1 && figures.length <= 3);
  for (const figure of figures) {
    assert.ok(['stat-row', 'table', 'bar'].includes(figure.type));
    assert.ok(figure.title.length >= 8 && figure.title.length <= 64, figure.title);
    assert.ok(figure.items.length >= 1);
    assert.ok(figure.anchor >= 1 && figure.anchor <= 5);
    assert.ok(figure.items.every((item) => item.display && item.source));
  }
});

test('buildColumnFigures honors a valid model spec and rejects invalid ones', () => {
  const ledger = fixtureLedger();
  const headline = 'The Dakota Grid Deal Is A Utility Execution Story Now';
  const valid = buildColumnFigures({
    ledger,
    stance: JSON.parse(STANCE_JSON),
    headline,
    sectionCount: 6,
    modelSpec: [{ type: 'table', title: 'Dakota campus power and capital on the record', claim_indexes: [0, 1, 2], anchor: 3 }],
  });
  assert.equal(valid.source, 'model_spec');
  assert.equal(valid.figures.length, 1);
  assert.equal(valid.figures[0].type, 'table');
  assert.equal(valid.figures[0].anchor, 3);
  assert.ok(valid.figures[0].items.length >= 2);

  const invalid = buildColumnFigures({
    ledger,
    stance: JSON.parse(STANCE_JSON),
    headline,
    sectionCount: 6,
    modelSpec: [{ type: 'bar', title: 'x', claim_indexes: [99], anchor: 1 }],
  });
  assert.notEqual(invalid.source, 'model_spec');
  assert.ok(invalid.figures.length >= 1);

  const empty = buildColumnFigures({ ledger: { claims: [] }, stance: {}, headline: 'No numbers here', sectionCount: 5 });
  assert.equal(empty.figures.length, 0);
  assert.equal(empty.reason, 'no_verified_claims');
});

test('buildColumnFigures falls back to evidence-pack facts when the ledger yields nothing', () => {
  const facts = fixtureArticle().expert_insight.concrete_facts;
  const result = buildColumnFigures({
    ledger: { claims: [] },
    stance: JSON.parse(STANCE_JSON),
    headline: 'The Dakota Grid Deal Is A Utility Execution Story Now',
    sectionCount: 6,
    facts,
    factSource: 'Grid Journal',
  });
  assert.equal(result.source, 'evidence_pack');
  assert.equal(result.figures.length, 1);
  assert.equal(result.figures[0].type, 'table');
  assert.ok(result.figures[0].items.length >= 2);
  assert.ok(result.figures[0].items.every((item) => item.source === 'Grid Journal'));
});
