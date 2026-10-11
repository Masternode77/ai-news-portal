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
