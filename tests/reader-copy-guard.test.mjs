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
// Top-level metaDescription is not rendered by any template, so it is not in this list.
for (const field of ['title', 'deck', 'summary', 'body', 'imageAlt']) {
  test(`checks public ${field}`, () => {
    assert.equal(readerCopyResult({ [field]: 'The supplied extract reports a benchmark.' }).ok, false);
  });
}
test('all figure surfaces participate, without inspecting private review data', () => {
  const figure = { type: 'table', title: 'supplied extract', source_note: 'supplied extract', items: [{ label: 'supplied extract', display: 'supplied extract', source: 'supplied extract' }] };
  assert.equal(readerCopyResult({ content_origin: 'authored', figures: [figure] }).findings.length, 5);
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
  const candidate = { content_origin: 'authored', figures: [null, { type: 'bar', items: [null, { label: 'the supplied extract' }] }] };
  assert.deepEqual(readerCopyResult(candidate), readerCopyResult(candidate));
  assert.equal(readerCopySurfaces(candidate).length, 1);
});
test('nested public prose and metadata are checked', () => {
  assert.equal(readerCopyResult({ expertLensFull: { metaDescription: 'the supplied extract', finalArticleBody: 'I will not invent facts' } }).findings.length, 2);
});
test('legacy figure damage is a triage warning, not a factual-error assertion', () => {
  const candidate = { content_origin: 'authored', title: 'A specific headline', figures: [{ type: 'stat-row', title: 'A specific headline', items: [{ label: 'The demand forecast states that these customers connect to the' }] }] };
  assert.equal(readerCopyResult(candidate).ok, true);
  assert.deepEqual(editorialReviewWarnings(candidate).map(x => x.code), ['figure_repeats_headline', 'figure_possible_clipping']);
});
test('generation quality gate rejects leakage in figure labels', () => {
  const result = authoredColumnQualityResult({ body: 'A short fixture.', title: 'A specific hardware benchmark', deck: 'A source-supported description that separates benchmark results from production outcomes.', figures: [{ type: 'table', title: 'Measured benchmark', items: [{ label: 'the supplied extract' }] }] });
  assert.ok(result.reasons.includes('reader_copy:input_provenance:figures[0].items[0].label'));
  assert.equal(result.metrics.reader_copy_issue_count, 1);
});
test('existing internal-language guard now covers figure labels', () => {
  const result = authoredColumnQualityResult({ body: 'A short fixture.', title: 'A specific hardware benchmark', deck: 'A source-supported description that separates benchmark results from production outcomes.', figures: [{ type: 'table', title: 'Measured benchmark', items: [{ label: 'extraction QA' }] }] });
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
  // The page flag stands in for the route gates here; the gates have their own test in reader-copy-gate.test.mjs.
  const result = auditReaderCopy({ latest: [live], archived: [live, { id: 'private', articlePagePublished: false, body: 'the supplied extract' }] }, { newsPageEligible: (record) => record.articlePagePublished === true });
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
  'Our supplied excerpts stop at the second quarter.',
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
test('persisted presentation copy the renderer can consume is reader copy', () => {
  const result = readerCopyResult({
    deck: 'A clean deck.',
    public_presentation: { title: 'the extract I have', deck: 'The supplied extract reports a benchmark.', why_it_matters: 'I will not invent numbers.', image_alt: 'return strict JSON', lane_title: 'the supplied extract', region: 'the supplied extract', source: 'the supplied extract', category: 'the supplied extract' },
  });
  // Persisted title, region, source and category are never rendered (buildPublicPresentation derives them
  // elsewhere), and the persisted lane title is permanently shadowed by the route.
  assert.deepEqual(result.reasons, [
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
  'The utility filed a response. This provided excerpts from the filing to reviewers.',
  'Those supplied extracts of the forecast to regulators last week.',
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
test('a sentence-initial provenance phrase is caught after opening quotes, brackets and list markers', () => {
  for (const body of ['“Provided excerpts show a rise.”', '- Provided excerpts show a rise.', 'Heading\n> Provided excerpts show a rise.', '(Supplied extracts omit the table.)', 'Load grew. "Provided excerpts show why."']) {
    assert.deepEqual(readerCopyResult({ body }).reasons, ['reader_copy:input_provenance:body'], body);
  }
  assert.equal(readerCopyResult({ body: '“The utility supplied extracts of its forecast,” the filing says.' }).ok, true);
});
test('card metadata chips are reader copy', () => {
  const result = readerCopyResult({
    region: 'US', source: 'HPCwire', category: 'Power & Grid',
    public_presentation: { signal_label: 'Analysis', editorial_lens: 'I will not invent numbers', lane_title: 'the supplied extract' },
    public_routing: { public_signal_label: 'Signal', editorial_lens: 'return strict JSON', laneTitle: 'Operator Alerts' },
  });
  // The route always carries a label, lens and lane, so the persisted presentation chips never render.
  assert.deepEqual(result.reasons, ['reader_copy:instruction_scaffold:public_routing.editorial_lens']);
});
test('unattributed prepositional and participial uses are still input provenance', () => {
  for (const body of ['This analysis is based on provided excerpts of the filing.', 'Using supplied extracts, the figures were rebuilt.', 'The numbers come from provided excerpts.', 'A reading drawn with supplied extracts only.']) {
    assert.deepEqual(readerCopyResult({ body }).reasons, ['reader_copy:input_provenance:body'], body);
  }
  for (const body of ['EIA provided excerpts from the filing.', 'The vendor provided excerpts of the contract to the board.', 'The utility supplied extracts of its load forecast to regulators.']) {
    assert.equal(readerCopyResult({ body }).ok, true, body);
  }
});
test('tag pills, the column byline and the column source list are reader copy', () => {
  // Tag pills render on the news page; the byline and source list on the column page.
  assert.deepEqual(readerCopyResult({ tags: ['kubernetes', 'the supplied extract'] }).reasons, ['reader_copy:input_provenance:tags[1]']);
  const result = readerCopyResult({
    content_origin: 'authored',
    tags: ['kubernetes', 'the supplied extract'],
    author: { name: 'I will not invent numbers', role: 'Columnist', slug: 'x' },
    sources: [
      { url: 'https://example.com/report', name: 'HPCwire', title: 'return strict JSON', publisher: 'the supplied extract', author: 'I will not invent numbers' },
      // Dropped by the column page: no name, or no safe http(s) URL.
      { url: 'https://example.com/other', title: 'the supplied extract' },
      { url: 'javascript:alert(1)', name: 'the supplied extract', title: 'the supplied extract' },
      // Author renders only in the Epoch AI licence line.
      { url: 'https://epoch.ai/gradient-updates/compute-trends', name: 'Epoch AI', title: 'Compute trends', author: 'return strict JSON' },
      null,
    ],
  });
  // publisher is never rendered; author only for an Epoch AI source.
  // A column's tags are never displayed, so only the byline and source list count here.
  assert.deepEqual(result.reasons, [
    'reader_copy:process_assurance:author.name',
    'reader_copy:instruction_scaffold:sources[0].title',
    'reader_copy:instruction_scaffold:sources[3].author',
  ]);
});
test('the first source name feeds the publication catalog whatever its URL', () => {
  const result = readerCopyResult({
    content_origin: 'authored',
    sources: [
      { url: 'not a url', name: 'the supplied extract', title: 'return strict JSON' },
      { url: 'not a url', name: 'the supplied extract', title: 'return strict JSON' },
    ],
  });
  // sources[0].name renders on PublicationCard; nothing else from a dropped entry does.
  assert.deepEqual(result.reasons, ['reader_copy:input_provenance:sources[0].name']);
});
test('the lane title is not rendered and is not a surface', () => {
  assert.equal(readerCopyResult({ public_routing: { public_signal_label: 'Signal', editorial_lens: 'Clean.', laneTitle: 'the supplied extract' } }).ok, true);
});
test('a colon label before the phrase is a sentence boundary', () => {
  for (const body of ['Evidence note: Provided excerpts show a rise.', 'Method; supplied extracts were compared.']) {
    assert.deepEqual(readerCopyResult({ body }).reasons, ['reader_copy:input_provenance:body'], body);
  }
  assert.equal(readerCopyResult({ body: 'Source: EIA provided excerpts from the filing.' }).ok, true);
});
test('the column thesis is reader copy', () => {
  assert.deepEqual(readerCopyResult({ content_origin: 'authored', stance: { thesis: 'I will not invent numbers.' } }).reasons, ['reader_copy:process_assurance:stance.thesis']);
});
test('a fallback field shadowed by the rendered value is not reader copy', () => {
  assert.equal(readerCopyResult({ body: 'the supplied extract', expertLensFull: { finalArticleBody: 'A clean final body.' } }).ok, true);
  assert.deepEqual(readerCopyResult({ body: 'the supplied extract' }).reasons, ['reader_copy:input_provenance:body']);
  assert.equal(readerCopyResult({ deck: 'the supplied extract', why_it_matters: 'I will not invent numbers', imageAlt: 'return strict JSON', public_presentation: { deck: 'Clean.', why_it_matters: 'Clean.', image_alt: 'Clean visual' } }).ok, true);
  // The renderer selects with `persisted.deck || deck`, so a whitespace-only persisted deck still hides the top-level one;
  // an empty string or a missing value does not.
  assert.equal(readerCopyResult({ deck: 'the supplied extract', public_presentation: { deck: '   ' } }).ok, true);
  assert.deepEqual(readerCopyResult({ deck: 'the supplied extract', public_presentation: { deck: '' } }).reasons, ['reader_copy:input_provenance:deck']);
  assert.equal(readerCopyResult({ body: 'the supplied extract', expertLensFull: { finalArticleBody: ' ' } }).ok, true);
});

test('column records keep their direct deck and image alt even when a presentation value exists', () => {
  const column = { content_origin: 'authored', deck: 'the supplied extract', imageAlt: 'return strict JSON', public_presentation: { deck: 'Clean.', image_alt: 'Clean visual' } };
  assert.deepEqual(readerCopyResult(column).reasons, ['reader_copy:input_provenance:deck', 'reader_copy:instruction_scaffold:imageAlt']);
  // The final body still shadows a legacy body for a column, as on the column page.
  assert.equal(readerCopyResult({ content_origin: 'authored', body: 'the supplied extract', expertLensFull: { finalArticleBody: 'Clean.' } }).ok, true);
});

test('unattributed evidence and source-text forms are input provenance too', () => {
  for (const body of ['Provided evidence shows the delay.', 'Supplied source text does not include the date.', 'Heading\n\nProvided evidence shows the delay.', 'The figure is based on supplied evidence.', 'A reading drawn from provided source text.']) {
    assert.deepEqual(readerCopyResult({ body }).reasons, ['reader_copy:input_provenance:body'], body);
  }
  for (const body of ['The supplier provided evidence of the delay.', 'Utilities provided evidence to the commission.', 'The filing drew on evidence supplied by the utility.', 'This provided evidence that the forecast was conservative.']) {
    assert.equal(readerCopyResult({ body }).ok, true, body);
  }
});

test('figures are a column surface only, and only when they render', () => {
  const figure = { type: 'bar', title: 'the supplied extract', items: [{ label: 'the supplied extract' }] };
  // news/[id].astro never renders figures.
  assert.equal(readerCopyResult({ figures: [figure] }).ok, true);
  // ColumnFigure emits nothing for a figure without items.
  assert.equal(readerCopyResult({ content_origin: 'authored', figures: [{ title: 'the supplied extract', items: [] }, { title: 'the supplied extract' }] }).ok, true);
  assert.deepEqual(readerCopyResult({ content_origin: 'authored', figures: [figure] }).reasons, ['reader_copy:input_provenance:figures[0].title', 'reader_copy:input_provenance:figures[0].items[0].label']);
});
test('only dated correction notes are reader copy', () => {
  assert.equal(readerCopyResult({ corrections: [{ summary: 'the supplied extract' }, { date: 'yesterday', summary: 'the supplied extract' }, { date: '2026-10-11', summary: '   ' }] }).ok, true);
  assert.deepEqual(readerCopyResult({ corrections: [{ date: '2026-10-11', summary: 'the supplied extract' }] }).reasons, ['reader_copy:input_provenance:corrections[0].summary']);
});
test('the writer as passive recipient is input provenance', () => {
  for (const body of ['We were provided excerpts from the filing.', 'I was supplied the source text.', 'The excerpt was provided to us.', 'We were given evidence of the delay.', 'We have been handed some extracts.']) {
    assert.deepEqual(readerCopyResult({ body }).reasons, ['reader_copy:input_provenance:body'], body);
  }
  for (const body of ['EIA provided excerpts from the filing.', 'The utility was provided excerpts by the regulator.', 'Excerpts were provided to the commission.', 'We were told the plant would close.']) {
    assert.equal(readerCopyResult({ body }).ok, true, body);
  }
});

test('figure item fields follow the figure type ColumnFigure renders', () => {
  const item = { label: 'Clean label', display: '1 GW', source: 'the supplied extract' };
  // stat-row and bar print label and display only; a table prints the source column too; an unknown type prints no item fields.
  assert.equal(readerCopyResult({ content_origin: 'authored', figures: [{ type: 'stat-row', title: 'Approved load', items: [item] }, { type: 'bar', title: 'Approved load', items: [item] }] }).ok, true);
  assert.deepEqual(readerCopyResult({ content_origin: 'authored', figures: [{ type: 'table', title: 'Approved load', items: [item] }] }).reasons, ['reader_copy:input_provenance:figures[0].items[0].source']);
  assert.deepEqual(readerCopyResult({ content_origin: 'authored', figures: [{ type: 'sparkline', title: 'the supplied extract', items: [{ label: 'the supplied extract', display: 'return strict JSON' }] }] }).reasons, ['reader_copy:input_provenance:figures[0].title']);
});
test('numbered list prefixes are sentence starts too', () => {
  for (const body of ['1) Provided excerpts show a rise.', '(2) Supplied extracts show a rise.', 'Heading\n\n3) Provided evidence shows a rise.', '12. Provided excerpts show a rise.']) {
    assert.deepEqual(readerCopyResult({ body }).reasons, ['reader_copy:input_provenance:body'], body);
  }
  assert.equal(readerCopyResult({ body: 'In 2024 the utility provided excerpts to the board.' }).ok, true);
});
test('deck fallbacks are reader copy only when no deck is stored', () => {
  const fallbacks = { summary: 'the supplied extract', snippet: 'I will not invent numbers', expertLensShort: 'return strict JSON', expertLensFull: { metaDescription: 'the extract I have' } };
  assert.equal(readerCopyResult({ ...fallbacks, deck: 'A clean deck.' }).ok, true);
  assert.equal(readerCopyResult({ ...fallbacks, public_presentation: { deck: 'A clean persisted deck.' } }).ok, true);
  assert.deepEqual(readerCopyResult(fallbacks).reasons, [
    'reader_copy:input_provenance:summary',
    'reader_copy:process_assurance:snippet',
    'reader_copy:instruction_scaffold:expertLensShort',
    'reader_copy:writer_extract:expertLensFull.metaDescription',
  ]);
  // A column prints its summary as the page description even with a deck; top-level metaDescription is never rendered.
  assert.deepEqual(readerCopyResult({ content_origin: 'authored', deck: 'A clean deck.', summary: 'the supplied extract' }).reasons, ['reader_copy:input_provenance:summary']);
  assert.equal(readerCopyResult({ metaDescription: 'the supplied extract' }).ok, true);
});

test('a final headline shadows the raw title of a news record, not of a column', () => {
  assert.equal(readerCopyResult({ title: 'the supplied extract', expertLensFull: { finalHeadline: 'A clean headline' } }).ok, true);
  assert.deepEqual(readerCopyResult({ title: 'the supplied extract' }).reasons, ['reader_copy:input_provenance:title']);
  assert.deepEqual(readerCopyResult({ content_origin: 'authored', title: 'the supplied extract', expertLensFull: { finalHeadline: 'A clean headline' } }).reasons, ['reader_copy:input_provenance:title']);
  // Top-level headline is read by no renderer.
  assert.equal(readerCopyResult({ headline: 'the supplied extract' }).ok, true);
});

test('the writer as active recipient is input provenance', () => {
  for (const body of ['I received excerpts from the source for this draft.', 'We received the source text.', 'We obtained evidence of the delay.', 'We got some extracts of the filing.']) {
    assert.deepEqual(readerCopyResult({ body }).reasons, ['reader_copy:input_provenance:body'], body);
  }
  for (const body of ['The commission received excerpts from the utility.', 'Regulators received evidence that the plant would close.', 'We received confirmation from the utility.']) {
    assert.equal(readerCopyResult({ body }).ok, true, body);
  }
});
test('a column\'s legacy persisted presentation never renders', () => {
  const stale = { deck: 'the supplied extract', why_it_matters: 'I will not invent numbers', image_alt: 'return strict JSON', reader_impact: ['the supplied extract'] };
  assert.equal(readerCopyResult({ content_origin: 'authored', deck: 'A clean deck.', public_presentation: stale }).ok, true);
  assert.equal(readerCopyResult({ deck: 'A clean deck.', public_presentation: stale }).findings.length, 4);
});
test('the legacy category is a surface only when no primary category is selected', () => {
  assert.equal(readerCopyResult({ primary_category: 'Power & Grid', category: 'the supplied extract' }).ok, true);
  assert.deepEqual(readerCopyResult({ category: 'the supplied extract' }).reasons, ['reader_copy:input_provenance:category']);
  assert.deepEqual(readerCopyResult({ primary_category: 'the supplied extract', category: 'Power & Grid' }).reasons, ['reader_copy:input_provenance:primary_category']);
});

test('byline, source list and thesis are column surfaces only', () => {
  const metadata = { author: { name: 'the supplied extract', role: 'return strict JSON' }, sources: [{ url: 'https://example.com/a', name: 'the supplied extract', title: 'I will not invent numbers' }], stance: { thesis: 'the extract I have' } };
  // news/[id].astro renders no byline, source list or thesis from the record.
  assert.equal(readerCopyResult(metadata).ok, true);
  assert.equal(readerCopyResult({ content_origin: 'authored', ...metadata }).findings.length, 5);
});
test('a passive recipient with "with" is input provenance', () => {
  for (const body of ['I was provided with excerpts from the filing.', 'We were supplied with the source text.', 'We have been provided with evidence of the delay.']) {
    assert.deepEqual(readerCopyResult({ body }).reasons, ['reader_copy:input_provenance:body'], body);
  }
  assert.equal(readerCopyResult({ body: 'The commission was provided with excerpts by the utility.' }).ok, true);
});

test('perfect-tense active recipient disclosures are input provenance', () => {
  for (const body of ['I have received excerpts from the filing.', 'We have obtained the source text.', 'We had collected some evidence of the delay.', 'We have gotten the extracts.']) {
    assert.deepEqual(readerCopyResult({ body }).reasons, ['reader_copy:input_provenance:body'], body);
  }
  assert.equal(readerCopyResult({ body: 'The commission has received excerpts from the utility.' }).ok, true);
});
test('routing chips and tag pills are news surfaces only', () => {
  const metadata = { public_routing: { public_signal_label: 'the supplied extract', editorial_lens: 'I will not invent numbers' }, tags: ['return strict JSON'] };
  assert.equal(readerCopyResult({ content_origin: 'authored', ...metadata }).ok, true);
  assert.equal(readerCopyResult(metadata).findings.length, 3);
});

test('contracted writer-recipient phrases are input provenance', () => {
  for (const body of ["I've been provided with excerpts from the filing.", "We've received the source text.", 'We’d been given evidence of the delay.', "We'd collected some extracts."]) {
    assert.deepEqual(readerCopyResult({ body }).reasons, ['reader_copy:input_provenance:body'], body);
  }
  assert.equal(readerCopyResult({ body: "The utility's filing provided excerpts to the board." }).ok, true);
});
test('the detail route keeps only what the news page renders', () => {
  const cardOnly = { why_it_matters: 'the supplied extract', region: 'return strict JSON', public_presentation: { why_it_matters: 'I will not invent numbers', reader_impact: ['the supplied extract'] }, public_routing: { public_signal_label: 'the supplied extract', editorial_lens: 'the extract I have' } };
  assert.equal(readerCopyResult(cardOnly, { route: 'detail' }).ok, true);
  // Five on the default route: the persisted why-it-matters shadows the top-level one.
  assert.equal(readerCopyResult(cardOnly).findings.length, 5);
  // What the page does render is still checked on the detail route.
  const rendered = { title: 'the supplied extract', deck: 'I will not invent numbers', imageAlt: 'return strict JSON', source: 'the supplied extract', primary_category: 'the extract I have', tags: ['the supplied extract'], corrections: [{ date: '2026-10-11', summary: 'the supplied extract' }], expertLensFull: { finalArticleBody: 'the supplied extract' } };
  assert.equal(readerCopyResult(rendered, { route: 'detail' }).findings.length, 8);
  // A column renders its own fields on its page, so the route option changes nothing.
  assert.equal(readerCopyResult({ content_origin: 'authored', why_it_matters: 'the supplied extract' }, { route: 'detail' }).ok, false);
});
