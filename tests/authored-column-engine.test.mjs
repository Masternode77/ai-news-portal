import assert from 'node:assert/strict';
import test from 'node:test';
import {
  authoredInsightEligible,
  columnSourceLongformEligible,
  generateAuthoredColumn,
  MIN_STORY_FACTS,
  MIN_STORY_RELEVANCE,
  normalizeAuthoredBody,
  parseModelEssay,
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

function structuredEssay() {
  const { body, ...essay } = JSON.parse(essayJson());
  const opening_paragraphs = [];
  const sections = [];
  for (const block of body.split('\n\n')) {
    if (headingSequence(block).length) sections.push({ heading: block, paragraphs: [] });
    else (sections.at(-1)?.paragraphs || opening_paragraphs).push(block);
  }
  return { ...essay, opening_paragraphs, sections };
}

test('structured model sections serialize without losing or inventing prose and headings', () => {
  const structured = structuredEssay();
  const parsed = parseModelEssay(JSON.stringify(structured));
  assert.equal(parsed.body, JSON.parse(essayJson()).body);
  assert.deepEqual(headingSequence(parsed.body), structured.sections.map(section => section.heading));
  assert.deepEqual(parseModelEssay(essayJson()), JSON.parse(essayJson()), 'legacy adapters remain compatible');
  assert.throws(() => parseModelEssay(JSON.stringify({ ...structured, sections: 'invalid', body: parsed.body })), /invalid_structured_sections/);
  assert.throws(() => parseModelEssay(JSON.stringify({ ...structured, sections: [{ heading: "Europe's Grid Timing", paragraphs: ['Paragraph.'] }, ...structured.sections.slice(1)] })), /invalid_structured_heading/);
  assert.throws(() => parseModelEssay(JSON.stringify({ ...structured, sections: [{ heading: 'Valid Heading', paragraphs: ['Paragraph.\nHidden Heading'] }, ...structured.sections.slice(1)] })), /invalid_structured_paragraphs/);
  assert.throws(() => parseModelEssay(JSON.stringify({ ...structured, sections: structured.sections.slice(0, 2) })), /invalid_structured_sections/, 'missing sections must not be synthesized');
  assert.throws(() => parseModelEssay(JSON.stringify({ ...structured, sections: Array(7).fill(structured.sections[0]) })), /invalid_structured_sections/);
  assert.throws(() => parseModelEssay('not JSON'), /invalid_structured_essay/);
  assert.throws(() => parseModelEssay('{"headline":"Missing essay"}'), /invalid_structured_essay/);
});

test('explicit headings follow the existing renderer grammar after typography cleanup', () => {
  for (const [input, expected] of [
    ['2027 Changes Everything', '2027 Changes Everything'],
    ['Power & Water: A/B + C', 'Power & Water: A/B + C'],
    ['This Specific Heading Has More Than Six Words', 'This Specific Heading Has More Than Six Words'],
    ['## **lowercase grid \u2014 timing**', 'Lowercase grid - timing'],
    ['Percentiles, Defaults and Drive Specs', 'Percentiles / Defaults and Drive Specs'],
    ['Costs, Risks, and Timing', 'Costs / Risks and Timing'],
  ]) {
    const essay = structuredEssay();
    essay.sections[0].heading = input;
    const parsed = parseModelEssay(JSON.stringify(essay));
    assert.equal(headingSequence(parsed.body)[0], expected);
    assert.ok(parsed.body.includes(essay.sections[0].paragraphs[0]), 'prose is preserved');
  }
  for (const heading of ['A'.repeat(87), 'Ends With Period.', '<b>Hidden Markup</b>', 'A 1,000 MW Queue']) {
    const essay = structuredEssay();
    essay.sections[0].heading = heading;
    assert.throws(() => parseModelEssay(JSON.stringify(essay)), /invalid_structured_heading/);
  }
});

test('structured draft and revision pass the existing quality gates end to end', async () => {
  resetLlmUsageForTests();
  process.env.AUTHORED_MIN_WORDS = '700';
  process.env.AUTHORED_MIN_CHARS = '4200';
  let calls = 0;
  try {
    const result = await generateAuthoredColumn({
      candidates: [fixtureArticle()], sources: FIXTURE_SOURCES, state: {},
      now: new Date('2026-10-04T09:00:00Z'),
      callModel: async request => {
        calls += 1;
        assert.match(request.systemPrompt, /not evidence of an enacted permit condition/);
        if (calls === 1) return STANCE_JSON;
        assert.match(request.systemPrompt, /opening_paragraphs/);
        assert.match(request.systemPrompt, /uppercase letter/);
        return JSON.stringify(structuredEssay());
      },
    });
    assert.ok(result.column, JSON.stringify(result));
    assert.equal(result.column.expertLensFull.finalArticleBody, JSON.parse(essayJson()).body);
    assert.equal(result.column.authored_quality.metrics.sections, structuredEssay().sections.length);
    assert.equal(calls, 3);
  } finally {
    delete process.env.AUTHORED_MIN_WORDS;
    delete process.env.AUTHORED_MIN_CHARS;
  }
});

test('malformed first structured revision uses the existing bounded retry without dropping the draft', async () => {
  resetLlmUsageForTests();
  process.env.AUTHORED_MIN_WORDS = '700';
  process.env.AUTHORED_MIN_CHARS = '4200';
  try {
    const invalid = structuredEssay();
    invalid.sections[0].heading = "Europe's Grid Timing";
    invalid.sections[0].paragraphs.push('Grid availability remains a binding operating constraint.');
    for (const broken of [JSON.stringify(invalid), 'not JSON', '{"headline":"Missing essay"}']) {
      for (const repair of [true, false]) {
        let calls = 0;
        const result = await generateAuthoredColumn({
          candidates: [fixtureArticle()], sources: FIXTURE_SOURCES, state: {},
          now: new Date('2026-10-04T09:00:00Z'),
          callModel: async request => {
            calls += 1;
            if (calls === 1) return STANCE_JSON;
            if (calls === 4) {
              assert.match(request.systemPrompt, /invalid_structured_/);
              const expected = broken === JSON.stringify(invalid)
                ? parseModelEssay(broken, { recoverFormat: true }).body
                : JSON.parse(essayJson()).body;
              assert.equal(JSON.parse(request.userPrompt).body, expected, 'retry receives the latest parseable revision');
              if (broken === JSON.stringify(invalid)) {
                assert.match(request.systemPrompt, /Rewrite section 1's heading "Europe's Grid Timing"/);
                assert.match(expected, /Grid availability remains a binding operating constraint/);
              }
            }
            if (calls === 3 || (calls === 4 && !repair)) return broken;
            return JSON.stringify(structuredEssay());
          },
        });
        assert.equal(calls, 4);
        if (repair) assert.ok(result.column, JSON.stringify(result));
        else {
          assert.equal(result.column, null);
          assert.match(result.failure, /^(voice|verify):.*invalid_structured_/);
        }
      }
    }
  } finally {
    delete process.env.AUTHORED_MIN_WORDS;
    delete process.env.AUTHORED_MIN_CHARS;
  }
});

test('an unparseable first draft gets one repair attempt before the story is dropped', async () => {
  resetLlmUsageForTests();
  process.env.AUTHORED_MIN_WORDS = '700';
  process.env.AUTHORED_MIN_CHARS = '4200';
  try {
    for (const secondDraftValid of [true, false]) {
      let calls = 0;
      const result = await generateAuthoredColumn({
        candidates: [fixtureArticle()], sources: FIXTURE_SOURCES, state: {},
        now: new Date('2026-10-04T09:00:00Z'),
        callModel: async request => {
          calls += 1;
          if (calls === 1) return STANCE_JSON;
          if (calls === 2) {
            assert.doesNotMatch(request.systemPrompt, /Repair:/);
            return 'Here is the column you asked for.';
          }
          if (calls === 3) {
            assert.match(request.systemPrompt, /Repair: The previous reply failed invalid_structured_essay/);
            return secondDraftValid ? JSON.stringify(structuredEssay()) : '{"title": ""}';
          }
          return JSON.stringify(structuredEssay());
        },
      });
      if (secondDraftValid) {
        assert.ok(result.column, JSON.stringify(result));
        assert.equal(calls, 4, 'stance, failed draft, repaired draft, voice');
      } else {
        assert.equal(result.column, null);
        assert.match(result.failure, /^draft:invalid_structured_essay/);
        assert.equal(calls, 3, 'one repair attempt only');
      }
    }
  } finally {
    delete process.env.AUTHORED_MIN_WORDS;
    delete process.env.AUTHORED_MIN_CHARS;
  }
});

test('a wrapped reply, a title key or a raw line break inside a string still parses as the same essay', () => {
  const essay = structuredEssay();
  const expected = parseModelEssay(JSON.stringify(essay)).body;
  assert.equal(parseModelEssay(JSON.stringify({ column: essay })).body, expected, 'one envelope key is unwrapped');
  const { headline, ...rest } = essay;
  const aliased = parseModelEssay(JSON.stringify({ ...rest, title: headline }));
  assert.equal(aliased.headline, headline, 'title stands in for a missing headline');
  assert.equal(aliased.body, expected);
  const rawBreak = JSON.stringify({ ...essay, deck: 'DECKMARK' }).replace('DECKMARK', 'First line\nsecond line');
  assert.throws(() => JSON.parse(rawBreak), 'the fixture really is invalid strict JSON');
  assert.equal(parseModelEssay(rawBreak).body, expected);
  assert.throws(() => parseModelEssay('{"column": {"title": ""}}'), /invalid_structured_essay/, 'an empty envelope still fails');
});

test('draft heading formatting reaches revision but cannot bypass final structure verification', async () => {
  resetLlmUsageForTests();
  process.env.AUTHORED_MIN_WORDS = '700';
  process.env.AUTHORED_MIN_CHARS = '4200';
  try {
    for (const repair of [true, false]) {
      let calls = 0;
      const invalid = structuredEssay();
      invalid.sections[0].heading = "Europe's Grid Timing";
      const result = await generateAuthoredColumn({
        candidates: [fixtureArticle()], sources: FIXTURE_SOURCES, state: {},
        now: new Date('2026-10-04T09:00:00Z'),
        callModel: async request => {
          calls += 1;
          if (calls === 1) return STANCE_JSON;
          if (calls === 3) {
            assert.match(request.systemPrompt, /Rewrite section 1's heading/);
            assert.ok(JSON.parse(request.userPrompt).body.includes("Europe's Grid Timing"));
          }
          return JSON.stringify(calls === 2 || !repair ? invalid : structuredEssay());
        },
      });
      if (repair) {
        assert.ok(result.column, JSON.stringify(result));
        assert.equal(calls, 3);
      } else {
        assert.equal(result.column, null);
        assert.match(result.failure, /^verify:.*invalid_structured_heading/);
        assert.equal(calls, 4);
      }
    }
  } finally {
    delete process.env.AUTHORED_MIN_WORDS;
    delete process.env.AUTHORED_MIN_CHARS;
  }
});

test('legacy body-only replies cannot clear an unresolved structured heading failure', async () => {
  resetLlmUsageForTests();
  process.env.AUTHORED_MIN_WORDS = '700';
  process.env.AUTHORED_MIN_CHARS = '4200';
  try {
    for (const invalidAtDraft of [true, false]) {
      let calls = 0;
      const invalid = structuredEssay();
      invalid.sections[0].heading = "Europe's Grid Timing";
      const legacy = parseModelEssay(JSON.stringify(invalid), { recoverFormat: true });
      delete legacy.formatIssues;
      assert.throws(() => parseModelEssay(JSON.stringify(legacy), { requireSections: true }), /invalid_structured_sections/);
      const result = await generateAuthoredColumn({
        candidates: [fixtureArticle()], sources: FIXTURE_SOURCES, state: {},
        now: new Date('2026-10-04T10:00:00Z'),
        callModel: async () => {
          calls += 1;
          if (calls === 1) return STANCE_JSON;
          if (calls === 2) return JSON.stringify(invalidAtDraft ? invalid : structuredEssay());
          if (calls === 3 && !invalidAtDraft) return JSON.stringify(invalid);
          return JSON.stringify(legacy);
        },
      });
      assert.equal(calls, 4);
      assert.equal(result.column, null);
      assert.equal(result.failure, 'voice:invalid_structured_sections');
    }
  } finally {
    delete process.env.AUTHORED_MIN_WORDS;
    delete process.env.AUTHORED_MIN_CHARS;
  }
});

test('voice revision receives the verified numeric ledger and rejects invented watch horizons', async () => {
  resetLlmUsageForTests();
  process.env.AUTHORED_MIN_WORDS = '700';
  process.env.AUTHORED_MIN_CHARS = '4200';
  try {
    for (const repair of [true, false]) {
      let calls = 0;
      const result = await generateAuthoredColumn({
        candidates: [fixtureArticle()], sources: FIXTURE_SOURCES, state: {},
        now: new Date('2026-10-04T10:00:00Z'),
        callModel: async request => {
          calls += 1;
          if (calls === 1) {
            assert.match(request.systemPrompt, /never invent numeric timelines/);
            return STANCE_JSON;
          }
          const essay = structuredEssay();
          if (calls === 3 || calls === 4) {
            const payload = JSON.parse(request.userPrompt);
            assert.ok(payload.verified_claims.some(claim => claim.value === 200));
            assert.equal(payload.evidence.source_text, `${fixtureArticle().title}\n${SOURCE_TEXT}`);
            assert.match(request.systemPrompt, /Source fidelity contract/);
            assert.match(request.systemPrompt, /Correcting evidence failures takes priority/);
            assert.match(request.systemPrompt, /Remove unsupported numbers rather than spelling them out/);
          }
          if (calls === 4) assert.match(request.systemPrompt, /18 months/);
          if (calls < 4 || !repair) essay.sections[0].paragraphs.push('The project will complete in 18 months.');
          return JSON.stringify(essay);
        },
      });
      assert.equal(calls, 4);
      if (repair) {
        assert.ok(result.column, JSON.stringify(result));
        assert.equal(result.column.authored_quality.metrics.unsupported_claim_count, 0);
      } else {
        assert.equal(result.column, null);
        assert.match(result.failure, /unsupported_numeric_claims:18 months/);
      }
    }
  } finally {
    delete process.env.AUTHORED_MIN_WORDS;
    delete process.env.AUTHORED_MIN_CHARS;
  }
});

test('engine skips cleanly with generation explicitly disabled', async () => {
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

test('authored selection treats missing company or fact heuristics as non-blocking but keeps substantive insight required', () => {
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
  // A market or system story without a named company can still be argued.
  assert.equal(authoredInsightEligible(anonymous), true);
  assert.equal(selectColumnStory({ candidates: [anonymous], sources: FIXTURE_SOURCES })?.article.id, anonymous.id);

  // Without a bottleneck or decision point there is nothing to argue.
  const thin = {
    ...anonymous,
    id: 'thin-policy',
    sourceUrl: 'https://example.com/thin-policy',
    expert_insight: {
      ...anonymous.expert_insight,
      bottleneck_type: '',
      expert_insight_missing_fields: ['named_companies', 'bottleneck_type'],
    },
  };
  assert.equal(authoredInsightEligible(thin), false);
  assert.equal(selectColumnStory({ candidates: [thin], sources: FIXTURE_SOURCES }), null);
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
    assert.equal(state.authored.lastFailure.metrics.sections, 0);
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
  const [density] = verificationFeedback(['insight_density_below_0.75']);
  assert.match(density, /constraints, allocation choices and milestones/);
  assert.match(density, /factual premises are established/, 'analytical detail must not invent economic premises');
  assert.match(density, /Preserve attribution and qualifiers/);
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
    assert.ok(figure.title.length >= 8 && figure.title.length <= 105, figure.title);
    assert.ok(figure.items.length >= 1);
    assert.ok(figure.anchor >= 1 && figure.anchor <= 5);
    assert.ok(figure.items.every((item) => item.display && item.source));
  }
});

test('deterministic figure titles preserve the complete validated headline and its qualifier', () => {
  const headline='Up to 3× pod density is a Kubernetes benchmark, not a reason to assume production fleets can swap safely';
  const ledger={claims:[
    {claim_id:'density',claim_text:'The Kubernetes benchmark reported pod density of up to 3 times for one measured group.',numeric_value:3,unit:'times',source_name:'Kubernetes Blog',verification_status:'verified_primary'},
    {claim_id:'nodes',claim_text:'The Kubernetes pod density benchmark evaluated 4 node configurations in its measured setup.',numeric_value:4,unit:'nodes',source_name:'Kubernetes Blog',verification_status:'verified_primary'},
  ]};
  const result=buildColumnFigures({
    ledger,
    stance:{...JSON.parse(STANCE_JSON),angle:headline},
    headline,
    sectionCount:6,
  });
  assert.equal(result.source,'deterministic');
  assert.equal(result.figures[0].title,headline);
  assert.match(result.figures[0].title,/not a reason to assume production fleets can swap safely$/);
});

test('fact-table labels preserve the complete verified statement and its qualifiers', () => {
  const fact='The Kubernetes ecosystem has reached a fundamental physical resource constraint: the strict limits of hardware memory versus the growing demand for dynamic, bursty workloads in the new agentic era.';
  const ledger=buildClaimLedger({
    cluster_id:'complete_fact_label',
    representative_source:{
      source_url:'https://example.com/kubernetes-memory',
      source_name:'Kubernetes Blog',
      title:'Kubernetes memory constraint',
      cleaned_text:fact,
    },
    supporting_sources:[],
  },'complete_fact_label');
  const result=buildColumnFigures({
    ledger,
    stance:{angle:'Kubernetes memory constraint for dynamic workloads'},
    headline:'Kubernetes memory limits shape dynamic workloads',
    sectionCount:5,
  });
  assert.equal(result.source,'fact_table');
  assert.equal(result.figures[0].items[0].label,fact);
  assert.match(result.figures[0].items[0].label,/growing demand for dynamic, bursty workloads/);
});

test('evidence-pack figure labels do not cut conditional facts into partial claims', () => {
  const conditionalFact='Local SSD-backed swap may increase pod density only when enough resident memory is dormant and the active working set remains in physical memory.';
  const result=buildColumnFigures({
    ledger:{claims:[]},
    stance:{angle:'Dormant memory sets the boundary for node swap'},
    headline:'Node swap depends on dormant memory',
    sectionCount:5,
    facts:[conditionalFact,'Operators must measure workload behavior before changing capacity assumptions for production clusters.'],
    factSource:'Kubernetes Blog',
  });
  assert.equal(result.source,'evidence_pack');
  assert.equal(result.figures[0].items[0].label,conditionalFact);
  assert.match(result.figures[0].items[0].label,/only when.*active working set remains/);
});

test('each figure row windows its label around its own number when a sentence holds several', () => {
  const ledger = buildClaimLedger({
    cluster_id: 'authored_two_numbers',
    representative_source: {
      source_url: 'https://example.com/trade',
      source_name: 'Example Research',
      title: 'Server trade gap between Malaysia and China',
      cleaned_text: 'Between April 2024 and June 2025, China recorded $3.8 billion of server imports from Malaysia, at AI server prices of $80,000 to $150,000 per unit, yet Malaysia recorded only $0.6 billion of exports to China across the same months.',
    },
    supporting_sources: [],
  }, 'two_numbers');
  const claims = numericLedgerClaims(ledger);
  const indexOf = (value) => claims.findIndex((claim) => claim.numeric_value === value);
  const result = buildColumnFigures({
    ledger,
    stance: { angle: 'The server trade gap between Malaysia and China' },
    headline: 'Malaysia and China disagree on the server trade',
    sectionCount: 6,
    modelSpec: [{ type: 'stat-row', title: 'The customs value gap', claim_indexes: [indexOf(3.8), indexOf(0.6)], anchor: 1 }],
  });
  const [first, second] = result.figures[0].items;
  assert.match(first.label, /\$3\.8 billion/);
  assert.match(second.label, /\$0\.6 billion/, 'the second row names its own figure');
  assert.notEqual(first.label, second.label);
});

test('equal magnitudes with different units keep their own figure labels', () => {
  const ledger = buildClaimLedger({
    cluster_id: 'authored_units',
    representative_source: {
      source_url: 'https://example.com/units',
      source_name: 'Example Utility',
      title: 'Utility approves a battery project for a data center campus',
      cleaned_text: 'The utility approved a 10 MW battery project for the campus, and the developer separately closed $10 million of construction financing for the site this month.',
    },
    supporting_sources: [],
  }, 'units');
  const claims = numericLedgerClaims(ledger);
  const indexOf = (unit) => claims.findIndex((claim) => claim.numeric_value === 10 && claim.unit === unit);
  const result = buildColumnFigures({
    ledger,
    stance: { angle: 'Battery capacity and financing at the data center campus' },
    headline: 'The utility battery approval is a data center campus financing story',
    sectionCount: 6,
    modelSpec: [{ type: 'stat-row', title: 'Battery capacity and financing', claim_indexes: [indexOf('MW'), indexOf('million')], anchor: 1 }],
  });
  const [capacity, financing] = result.figures[0].items;
  assert.match(capacity.label, /10 MW/);
  assert.match(financing.label, /\$10 million/, 'the financing row windows around its own figure');
  assert.notEqual(capacity.label, financing.label);
});

test('two figures early in one sentence without a comma still get their own labels', () => {
  const ledger = buildClaimLedger({
    cluster_id: 'authored_early_pair',
    representative_source: {
      source_url: 'https://example.com/northline',
      source_name: 'Example Utility',
      title: 'Northline campus battery capacity and financing update',
      cleaned_text: 'Northline approved 10 MW of battery capacity and secured $10 million in construction financing for the campus expansion this month.',
    },
    supporting_sources: [],
  }, 'early_pair');
  const claims = numericLedgerClaims(ledger);
  const indexOf = (unit) => claims.findIndex((claim) => claim.numeric_value === 10 && claim.unit === unit);
  const result = buildColumnFigures({
    ledger,
    stance: { angle: 'Northline campus battery capacity and financing at the data center' },
    headline: 'Northline campus battery capacity and financing set the data center schedule',
    sectionCount: 6,
    modelSpec: [{ type: 'stat-row', title: 'Northline capacity and financing', claim_indexes: [indexOf('MW'), indexOf('million')], anchor: 1 }],
  });
  const [capacity, financing] = result.figures[0].items;
  assert.equal(capacity.label, 'Northline approved 10 MW of battery capacity');
  assert.equal(financing.label, 'secured $10 million in construction financing for the campus expansion this month');
});

test('a between-and range keeps both endpoints in each figure label', () => {
  const ledger = buildClaimLedger({
    cluster_id: 'authored_range',
    representative_source: {
      source_url: 'https://example.com/range',
      source_name: 'Example Utility',
      title: 'Utility sets the campus capacity range for the data center',
      cleaned_text: 'The utility will add capacity between 10 MW and 20 MW for the data center campus over two construction phases.',
    },
    supporting_sources: [],
  }, 'range');
  const claims = numericLedgerClaims(ledger);
  const indexOf = (value) => claims.findIndex((claim) => claim.numeric_value === value && claim.unit === 'MW');
  const result = buildColumnFigures({
    ledger,
    stance: { angle: 'The utility capacity range for the data center campus' },
    headline: 'The utility capacity range sets the data center campus schedule',
    sectionCount: 6,
    modelSpec: [{ type: 'stat-row', title: 'The campus capacity range', claim_indexes: [indexOf(10), indexOf(20)], anchor: 1 }],
  });
  for (const item of result.figures[0].items) assert.match(item.label, /between 10 MW and 20 MW/);
});

test('encoded entities before a figure do not shift its label onto another clause', () => {
  const ledger = buildClaimLedger({
    cluster_id: 'authored_entities',
    representative_source: {
      source_url: 'https://example.com/entities',
      source_name: 'Example Utility',
      title: 'Northline and Southline data center capacity and financing update',
      cleaned_text: 'Northline &quot;formally&quot; &amp; finally approved its 10 MW, while Southline secured $20 million in data center financing for the campus.',
    },
    supporting_sources: [],
  }, 'entities');
  const claims = numericLedgerClaims(ledger);
  const indexOf = (unit) => claims.findIndex((claim) => claim.unit === unit && /Northline/.test(claim.claim_text));
  const result = buildColumnFigures({
    ledger,
    stance: { angle: 'Northline and Southline data center capacity and financing' },
    headline: 'Northline and Southline data center capacity and financing diverge',
    sectionCount: 6,
    modelSpec: [{ type: 'stat-row', title: 'Northline and Southline on record', claim_indexes: [indexOf('MW'), indexOf('million')], anchor: 1 }],
  });
  const [capacity, financing] = result.figures[0].items;
  assert.match(capacity.label, /approved its 10 MW$/);
  assert.doesNotMatch(capacity.label, /Southline/);
  assert.match(financing.label, /Southline secured \$20 million/);
});

test('a between that names parties does not stop two figures from splitting', () => {
  const ledger = buildClaimLedger({
    cluster_id: 'authored_parties',
    representative_source: {
      source_url: 'https://example.com/parties',
      source_name: 'Example Utility',
      title: 'Northline and Southline data center capacity and financing agreement',
      cleaned_text: 'The agreement between Northline and Southline approved 10 MW of battery capacity and secured $10 million in construction financing for the data center campus.',
    },
    supporting_sources: [],
  }, 'parties');
  const claims = numericLedgerClaims(ledger);
  const indexOf = (unit) => claims.findIndex((claim) => claim.numeric_value === 10 && claim.unit === unit);
  const result = buildColumnFigures({
    ledger,
    stance: { angle: 'Northline and Southline data center capacity and financing agreement' },
    headline: 'The Northline and Southline agreement ties data center capacity to financing',
    sectionCount: 6,
    modelSpec: [{ type: 'stat-row', title: 'Northline and Southline agreement', claim_indexes: [indexOf('MW'), indexOf('million')], anchor: 1 }],
  });
  const [capacity, financing] = result.figures[0].items;
  assert.match(capacity.label, /approved 10 MW of battery capacity/);
  assert.doesNotMatch(capacity.label, /\$10 million/);
  assert.match(financing.label, /secured \$10 million/);
  assert.doesNotMatch(financing.label, /10 MW/);
});

test('a qualified range endpoint still keeps the range whole', () => {
  const ledger = buildClaimLedger({
    cluster_id: 'authored_qualified_range',
    representative_source: {
      source_url: 'https://example.com/qualified',
      source_name: 'Example Utility',
      title: 'Utility sets the campus capacity range for the data center',
      cleaned_text: 'The utility will add capacity between 10 MW and approximately 20 MW for the data center campus over two construction phases.',
    },
    supporting_sources: [],
  }, 'qualified_range');
  const claims = numericLedgerClaims(ledger);
  const indexOf = (value) => claims.findIndex((claim) => claim.numeric_value === value && claim.unit === 'MW');
  const result = buildColumnFigures({
    ledger,
    stance: { angle: 'The utility capacity range for the data center campus' },
    headline: 'The utility capacity range sets the data center campus schedule',
    sectionCount: 6,
    modelSpec: [{ type: 'stat-row', title: 'The campus capacity range', claim_indexes: [indexOf(10), indexOf(20)], anchor: 1 }],
  });
  for (const item of result.figures[0].items) assert.match(item.label, /between 10 MW and approximately 20 MW/);
});

test('the fallback figures never repeat claims whose labels were shortened to clauses', () => {
  const ledger = buildClaimLedger({
    cluster_id: 'authored_fallback_pair',
    representative_source: {
      source_url: 'https://example.com/trade',
      source_name: 'Example Research',
      title: 'Malaysia and China report different server trade values',
      cleaned_text: 'Between April 2024 and June 2025, China recorded $3.8 billion of server imports from Malaysia, yet Malaysia recorded only $0.6 billion of server exports to China.',
    },
    supporting_sources: [],
  }, 'fallback_pair');
  const result = buildColumnFigures({
    ledger,
    stance: { angle: 'China and Malaysia server trade values diverge' },
    headline: 'China and Malaysia disagree on the value of the server trade',
    sectionCount: 6,
    modelSpec: null,
  });
  const values = result.figures.flatMap((figure) => figure.items.map((item) => item.value));
  assert.ok(values.length >= 2, JSON.stringify(result));
  assert.equal(new Set(values).size, values.length, 'no value appears in two rows');
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

  const overlongModelTitle = buildColumnFigures({
    ledger,
    stance: JSON.parse(STANCE_JSON),
    headline,
    sectionCount: 6,
    modelSpec: [{ type: 'table', title: 'Dakota campus power evidence ' + 'x'.repeat(40), claim_indexes: [0, 1, 2], anchor: 3 }],
  });
  assert.notEqual(overlongModelTitle.source, 'model_spec');

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

test('column relevance floor is 0.6 on either lane and the fact floor is three', () => {
  const nearFloor = fixtureArticle({ id: 'near-floor', sourceUrl: 'https://example.com/near-floor', infrastructure_relevance_score: 0.62, ai_topic_score: 0.1 });
  const belowFloor = fixtureArticle({ id: 'below-floor', sourceUrl: 'https://example.com/below-floor', infrastructure_relevance_score: 0.5, ai_topic_score: 0.52 });
  const aiLane = fixtureArticle({ id: 'ai-lane', sourceUrl: 'https://example.com/ai-lane', infrastructure_relevance_score: 0.3, ai_topic_score: 0.64 });
  const { diagnostics } = selectColumnStoryWithDiagnostics({ candidates: [nearFloor, belowFloor, aiLane], sources: FIXTURE_SOURCES });
  assert.equal(diagnostics.counts.qualifying, 2);
  assert.equal(diagnostics.counts.relevance_below_threshold, 1);
  assert.equal(MIN_STORY_RELEVANCE, 0.6);
  assert.equal(MIN_STORY_FACTS, 3);
});

test('a rejected top story falls through to the next-ranked qualifying story in the same run', async () => {
  resetLlmUsageForTests();
  process.env.OPENROUTER_API_KEY = 'test-key';
  process.env.AUTHORED_MIN_WORDS = '700';
  process.env.AUTHORED_MIN_CHARS = '4200';
  try {
    const first = fixtureArticle();
    const second = fixtureArticle({ id: 'wire-002', sourceUrl: 'https://example.com/northline-dakota-second' });
    const storiesSeen = [];
    const state = {};
    const result = await generateAuthoredColumn({
      candidates: [first, second],
      sources: FIXTURE_SOURCES,
      state,
      now: new Date('2026-10-04T09:00:00Z'),
      callModel: async (request) => {
        const forSecond = request.userPrompt.includes('northline-dakota-second');
        if (/choose the stance/.test(request.systemPrompt)) {
          storiesSeen.push(forSecond ? 'second' : 'first');
          return STANCE_JSON;
        }
        if (!forSecond) return JSON.stringify({ headline: 'Too Short To Publish Anywhere Near The Bar', deck: 'A deck that is long enough to pass the standfirst window but backed by a body that is far too short.', body: 'One tiny paragraph that fails every structural check.' });
        return JSON.stringify(structuredEssay());
      },
    });
    assert.ok(result.column, JSON.stringify(result.selectionDiagnostics));
    assert.deepEqual(storiesSeen, ['first', 'second']);
    assert.equal(result.column.based_on_article_ids[0], 'wire-002');
    assert.equal(result.selectionDiagnostics.attempts.length, 2);
    assert.match(result.selectionDiagnostics.attempts[0].outcome, /^verify:/);
    assert.equal(result.selectionDiagnostics.attempts[1].outcome, 'published');
    assert.equal(state.authored.lastFailure, null);
  } finally {
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.AUTHORED_MIN_WORDS;
    delete process.env.AUTHORED_MIN_CHARS;
  }
});

test('a spent LLM budget stops the run instead of trying another story', async () => {
  resetLlmUsageForTests();
  process.env.OPENROUTER_API_KEY = 'test-key';
  try {
    const { LlmBudgetExceededError } = await import('../scripts/lib/llm-budget.mjs');
    const first = fixtureArticle();
    const second = fixtureArticle({ id: 'wire-002', sourceUrl: 'https://example.com/northline-dakota-second' });
    let calls = 0;
    const state = {};
    const result = await generateAuthoredColumn({
      candidates: [first, second],
      sources: FIXTURE_SOURCES,
      state,
      now: new Date('2026-10-04T09:00:00Z'),
      callModel: async () => {
        calls += 1;
        throw new LlmBudgetExceededError('llm token budget exhausted (test)');
      },
    });
    assert.equal(result.column, null);
    assert.match(result.failure, /^thesis:llm token budget exhausted/);
    assert.equal(calls, 1);
    assert.equal(state.authored.lastFailure.attempts.length, 1);
  } finally {
    delete process.env.OPENROUTER_API_KEY;
  }
});

test('a stale source, a digest or an already-argued headline cannot anchor a column', async () => {
  const { digestRoundup } = await import('../scripts/lib/authored-column-engine.mjs');
  const now = new Date('2026-10-04T12:00:00Z');
  const old = fixtureArticle({
    id: 'old-source',
    sourceUrl: 'https://example.com/old-source',
    publishedAt: '2026-08-20T00:00:00Z',
    analysisPublishedAt: '2026-10-04T08:00:00Z',
  });
  const { diagnostics } = selectColumnStoryWithDiagnostics({ candidates: [old], sources: FIXTURE_SOURCES, now });
  assert.equal(diagnostics.counts.stale_story, 1, 'processing date must not make an old source look current');

  assert.equal(digestRoundup({ title: 'Daily News 21 / 09 / 2026', sourceUrl: 'https://example.com/x' }), true);
  assert.equal(digestRoundup({ title: 'Commission proposal', sourceUrl: 'https://ec.europa.eu/commission/presscorner/detail/en/mex_26_1918' }), true);
  assert.equal(digestRoundup({ title: 'Commission proposal', sourceUrl: 'https://ec.europa.eu/commission/presscorner/detail/en/ip_26_1667' }), false);
  const digest = fixtureArticle({ id: 'digest', title: 'Daily News 03 / 10 / 2026', sourceUrl: 'https://example.com/digest', publishedAt: '2026-10-04T06:00:00Z' });
  assert.equal(selectColumnStoryWithDiagnostics({ candidates: [digest], sources: FIXTURE_SOURCES, now }).diagnostics.counts.digest_roundup, 1);

  const fresh = fixtureArticle({ id: 'fresh-copy', sourceUrl: 'https://example.com/second-outlet-copy', publishedAt: '2026-10-04T06:00:00Z' });
  const existingColumns = [{ publishedAt: '2026-10-02T00:00:00Z', story_key: 'https://example.com/other', sources: [{ title: fresh.title, url: 'https://example.com/other' }] }];
  const covered = selectColumnStoryWithDiagnostics({ candidates: [fresh], sources: FIXTURE_SOURCES, now, existingColumns });
  assert.equal(covered.diagnostics.counts.already_covered, 1);
  assert.equal(covered.selection, null);
});

test('a second story is skipped when the stage lacks time for a full attempt', async () => {
  resetLlmUsageForTests();
  process.env.OPENROUTER_API_KEY = 'test-key';
  try {
    const first = fixtureArticle();
    const second = fixtureArticle({ id: 'wire-002', sourceUrl: 'https://example.com/northline-dakota-second' });
    const result = await generateAuthoredColumn({
      candidates: [first, second],
      sources: FIXTURE_SOURCES,
      state: {},
      now: new Date('2026-10-04T09:00:00Z'),
      deadlineMs: Date.now() + 1_000,
      callModel: async (request) => {
        if (/choose the stance/.test(request.systemPrompt)) return STANCE_JSON;
        return JSON.stringify({ headline: 'Too Short To Publish Anywhere Near The Bar', deck: 'A deck that is long enough to pass the standfirst window but backed by a body that is far too short.', body: 'One tiny paragraph that fails every structural check.' });
      },
    });
    assert.equal(result.column, null);
    assert.deepEqual(result.selectionDiagnostics.attempts.map((attempt) => attempt.outcome.split(':')[0]), ['verify', 'skipped']);
  } finally {
    delete process.env.OPENROUTER_API_KEY;
  }
});

test('the column insight-density floor is 0.75 and still rejects summary-heavy prose', async () => {
  const { AUTHORED_MIN_INSIGHT_DENSITY_DEFAULT } = await import('../scripts/lib/authored-column-policy.mjs');
  const { insightDensityScore } = await import('../scripts/lib/insight-density-score.mjs');
  assert.equal(AUTHORED_MIN_INSIGHT_DENSITY_DEFAULT, 0.75);
  const nearMiss = 'Export enforcement shifts the risk and the cost onto every supplier, operator and investor. Timing, capacity, leverage and allocation decide who absorbs it.';
  const score = insightDensityScore(nearMiss).insight_density_score;
  assert.ok(score >= 0.75 && score < 0.78, String(score));
  const result = authoredColumnQualityResult({ body: nearMiss, title: 'Short test', deck: '', summary: '', thesis: '', ledgerClaims: [], sourceText: '', recentRecords: [] });
  assert.ok(!result.reasons.some((reason) => reason.startsWith('insight_density_below')), result.reasons.join('|'));
  const summary = 'The company said it announced the deal, according to the article; the source reported the headline and said the article was reported.';
  const summaryResult = authoredColumnQualityResult({ body: summary, title: 'Short test', deck: '', summary: '', thesis: '', ledgerClaims: [], sourceText: '', recentRecords: [] });
  assert.ok(summaryResult.reasons.some((reason) => reason.startsWith('insight_density_below_0.75')));
});
