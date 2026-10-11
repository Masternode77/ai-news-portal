import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { readerCopyResult, readerCopySurfaces, editorialReviewWarnings } from '../scripts/lib/reader-copy-guard.mjs';
import { authoredColumnQualityResult } from '../scripts/lib/authored-column-policy.mjs';

for (const phrase of ['the supplied extract', 'the extract I have', 'the extract we received', 'THE PROVIDED EXCERPT', 'the supplied\n evidence', 'anything I have been given', 'I will not invent answers', 'my standing positions', 'return strict JSON', 'evidence.source_text']) {
  test(`rejects writer-only language: ${JSON.stringify(phrase)}`, () => {
    assert.equal(readerCopyResult({ body: `The article says ${phrase}.` }).ok, false);
  });
}
for (const field of ['title', 'deck', 'summary', 'body', 'metaDescription', 'imageAlt']) {
  test(`checks public ${field}`, () => {
    assert.equal(readerCopyResult({ [field]: 'The supplied extract reports a benchmark.' }).ok, false);
  });
}
test('all figure surfaces participate, without inspecting private review data', () => {
  const figure = { title: 'supplied extract', source_note: 'supplied extract', items: [{ label: 'supplied extract', display: 'supplied extract', source: 'supplied extract' }] };
  assert.equal(readerCopyResult({ figures: [figure] }).findings.length, 5);
  assert.equal(readerCopyResult({ source_text: 'supplied extract', authored_quality: { diagnostics: 'return strict JSON' } }).ok, true);
});
test('allows real AI terminology and evidence limitations', () => {
  const body = 'Prompt injection can redirect a model. The benchmark does not establish production latency. The Kubernetes Blog reports a limited test. An operator must measure the working set before procurement. I cannot verify the fleet result. The supplier provided evidence of performance.';
  assert.equal(readerCopyResult({ body }).ok, true);
});
test('does not mutate input or silently strengthen an absence claim', () => {
  const candidate = { body: 'The supplied extract does not report production measurements.' };
  const before = JSON.stringify(candidate);
  assert.equal(readerCopyResult(candidate).ok, false);
  assert.equal(JSON.stringify(candidate), before);
});
test('is deterministic and handles null figure entries', () => {
  const candidate = { figures: [null, { items: [null, { label: 'the supplied extract' }] }] };
  assert.deepEqual(readerCopyResult(candidate), readerCopyResult(candidate));
  assert.equal(readerCopySurfaces(candidate).length, 1);
});
test('nested public prose and metadata are checked', () => {
  assert.equal(readerCopyResult({ expertLensFull: { metaDescription: 'the supplied extract', finalArticleBody: 'I will not invent facts' } }).findings.length, 2);
});
test('legacy figure damage is a triage warning, not a factual-error assertion', () => {
  const candidate = { title: 'A specific headline', figures: [{ title: 'A specific headline', items: [{ label: 'The demand forecast states that these customers connect to the' }] }] };
  assert.equal(readerCopyResult(candidate).ok, true);
  assert.deepEqual(editorialReviewWarnings(candidate).map(x => x.code), ['figure_repeats_headline', 'figure_possible_clipping']);
});
test('generation quality gate rejects leakage in figure labels', () => {
  const result = authoredColumnQualityResult({ body: 'A short fixture.', title: 'A specific hardware benchmark', deck: 'A source-supported description that separates benchmark results from production outcomes.', figures: [{ title: 'Measured benchmark', items: [{ label: 'the supplied extract' }] }] });
  assert.ok(result.reasons.includes('reader_copy:input_provenance:figures[0].items[0].label'));
  assert.equal(result.metrics.reader_copy_issue_count, 1);
});
test('existing internal-language guard now covers figure labels', () => {
  const result = authoredColumnQualityResult({ body: 'A short fixture.', title: 'A specific hardware benchmark', deck: 'A source-supported description that separates benchmark results from production outcomes.', figures: [{ title: 'Measured benchmark', items: [{ label: 'extraction QA' }] }] });
  assert.ok(result.reasons.includes('internal_language_detected'));
});
test('charter uses source-bounded questions rather than universal conclusions', () => {
  const charter = JSON.parse(fs.readFileSync(new URL('../config/editorial/persona-charter.json', import.meta.url), 'utf8'));
  assert.equal(charter.version, 2);
  assert.equal(charter.standing_positions.length, 10);
  assert.ok(charter.persona.honesty_rules.some(x => x.includes('signing, closing, payment')));
  assert.ok(charter.voice.dos.some(x => x.includes('rendering benchmark is not an inference benchmark')));
});

test('audit separates published bodies, source-only records and duplicate IDs', async () => {
  const { auditReaderCopy } = await import('../scripts/audit-reader-copy.mjs');
  const live = { id: 'live', articlePagePublished: true, title: 'Live', body: 'the supplied extract' };
  const result = auditReaderCopy({ latest: [live], archived: [live, { id: 'private', articlePagePublished: false, body: 'the supplied extract' }] });
  assert.equal(result.uniqueRecords, 2);
  assert.equal(result.publishedRecords, 1);
  assert.equal(result.readerCopyFlaggedArticles, 1);
});
test('audit fails clearly on malformed collections', async () => {
  const { auditReaderCopy } = await import('../scripts/audit-reader-copy.mjs');
  assert.throws(() => auditReaderCopy({ latest: {} }), /must be an array/);
});

// --- Rule review against real published prose (2026-10-11 follow-up) ---
// Attribution of who supplied an extract or excerpt is ordinary reporting and
// must pass; an unattributed "the supplied extract" or the writer as recipient
// is drafting-process language and must fail.
for (const prose of [
  'The vendor provided excerpts of the contract to the county board.',
  'EIA provided excerpts from the filing in its weekly note.',
  'The utility supplied extracts of its load forecast to regulators.',
  'Abstract Excerpt: this paper presents a failure-analysis method for 3D ICs.',
  'What follows are excerpts of that discussion.',
  'Operators who secured firm capacity early will extract value from those who did not.',
  'Documents the developer provided show the substation schedule.',
  'The evidence the utility supplied was partial, and the filing says so.',
]) {
  test(`allows attributed source handling: ${JSON.stringify(prose)}`, () => {
    assert.equal(readerCopyResult({ body: prose }).ok, true);
  });
}
for (const phrase of [
  'Supplied extracts show a rise in approved load.',
  'The number is reported. Provided excerpts show a rise in approved load.',
  'The report says this provided excerpt omits the test configuration.',
  'Those supplied excerpts stop at the second quarter.',
  'the evidence I was given does not cover 2027',
  'the source text we have been given stops at the forecast year',
]) {
  test(`rejects unattributed input provenance: ${JSON.stringify(phrase)}`, () => {
    const result = readerCopyResult({ body: phrase });
    assert.equal(result.ok, false);
    assert.deepEqual([...new Set(result.findings.map((finding) => finding.code))], ['input_provenance']);
  });
}
test('card copy next to the deck is reader copy', () => {
  for (const field of ['snippet', 'why_it_matters', 'expertLensShort']) {
    const result = readerCopyResult({ [field]: 'The supplied extract reports a benchmark.' });
    assert.deepEqual(result.reasons, [`reader_copy:input_provenance:${field}`]);
  }
});
test('source evidence fields are never reader copy', () => {
  const evidence = 'The supplied extract reports a benchmark. Return strict JSON. I will not invent numbers.';
  assert.equal(readerCopyResult({ articleText: evidence, cleaned_source_text: evidence, rawText: evidence, source_evidence_text: evidence }).ok, true);
});

// --- Review follow-ups (PR #51) ---
test('a sentence-initial provenance phrase is caught after a heading or paragraph break', () => {
  for (const body of ['Heading\n\nProvided excerpts show a rise in approved load.', 'Heading\nSupplied extracts show a rise.', 'Supplied extracts show a rise.']) {
    assert.deepEqual(readerCopyResult({ body }).reasons, ['reader_copy:input_provenance:body'], body);
  }
  // Mid-sentence, attributed use still passes.
  assert.equal(readerCopyResult({ body: 'Heading\n\nThe utility supplied extracts of its forecast.' }).ok, true);
});
test('persisted presentation copy is reader copy', () => {
  const result = readerCopyResult({
    deck: 'A clean deck.',
    public_presentation: { title: 'the extract I have', deck: 'The supplied extract reports a benchmark.', why_it_matters: 'I will not invent numbers.', image_alt: 'return strict JSON', lane_title: 'the supplied extract' },
  });
  assert.deepEqual(result.reasons, [
    'reader_copy:writer_extract:public_presentation.title',
    'reader_copy:input_provenance:public_presentation.deck',
    'reader_copy:process_assurance:public_presentation.why_it_matters',
    'reader_copy:instruction_scaffold:public_presentation.image_alt',
  ]);
});
test('both spellings of the image alt field are reader copy', () => {
  assert.deepEqual(readerCopyResult({ imageAlt: 'the supplied extract', image_alt: 'return strict JSON' }).reasons, [
    'reader_copy:input_provenance:imageAlt',
    'reader_copy:instruction_scaffold:image_alt',
  ]);
});
test('reader-impact pills are reader copy', () => {
  const result = readerCopyResult({ public_presentation: { reader_impact: ['Operators', 'the supplied extract', 'Investors'] } });
  assert.deepEqual(result.reasons, ['reader_copy:input_provenance:public_presentation.reader_impact[1]']);
});
for (const prose of [
  'This provided evidence that the load forecast was conservative.',
  'That supplied evidence of a tighter market than the utility expected.',
  'All provided evidence of delays in the interconnection queue.',
]) {
  test(`allows "provided"/"supplied" as a verb after a demonstrative: ${JSON.stringify(prose)}`, () => {
    assert.equal(readerCopyResult({ body: prose }).ok, true);
  });
}
test('the adjective construction with evidence is still flagged', () => {
  for (const phrase of ['the supplied evidence stops in 2027', 'our provided source text omits the table', 'their supplied evidence']) {
    assert.deepEqual(readerCopyResult({ body: phrase }).reasons, ['reader_copy:input_provenance:body'], phrase);
  }
});
