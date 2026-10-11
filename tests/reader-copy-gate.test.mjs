import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { auditReaderCopy as auditWithRouteGates, defaultNewsPageEligible, publicCardSignalsFor, main } from '../scripts/audit-reader-copy.mjs';
import { authorizedAdminSourceRegistry, canonicalAdminArticle } from './fixtures/admin-publication-integrity.mjs';

// Most tests below exercise copy surfaces on minimal news fixtures; they treat
// the page flag as the page predicate. The route gates themselves are covered
// by the dedicated test at the end.
const auditReaderCopy = (collections, options = {}) => auditWithRouteGates(collections, { newsPageEligible: (record) => record.articlePagePublished === true, ...options });
import { buildArchiveFeed } from '../scripts/lib/archive-feed-builder.mjs';

const read = (relativePath) => fs.readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');
const COLLECTIONS = ['authored-columns', 'latest-news', 'archived-news'];

test('the built content gate runs the strict reader-copy audit', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.scripts['audit:reader-copy'], 'node ./scripts/audit-reader-copy.mjs --strict');
  assert.match(pkg.scripts['content:gate:built'], /&& npm run audit:reader-copy$/);
  assert.match(pkg.scripts['content:gate'], /npm run content:gate:built/);
  // Hosted validation and the Mac runner both reach the audit through the gate.
  assert.match(read('.github/workflows/update-news.yml'), /npm run content:gate:built/);
});

test('every committed published record and rendered homepage card passes the strict reader-copy audit', () => {
  const collections = Object.fromEntries(COLLECTIONS.map((name) => [name, JSON.parse(read(`src/data/${name}.json`))]));
  const records = [...collections['latest-news'], ...collections['archived-news']];
  const homepageSignals = publicCardSignalsFor(records);
  assert.ok(homepageSignals.length >= 30, `feeds render ${homepageSignals.length} cards`);
  // The card set is not capped at the homepage's 50 items: it covers the archive feed too.
  const archiveTotal = buildArchiveFeed(records, { page: 1, pageSize: Math.max(records.length, 1) }).items.length;
  assert.ok(homepageSignals.length >= archiveTotal, `${homepageSignals.length} cards audited for ${archiveTotal} archive-visible cards`);
  const report = auditReaderCopy(collections, { homepageSignals });
  assert.ok(report.publishedRecords > 0);
  assert.ok(report.homepageCards > 0);
  assert.deepEqual(
    [...report.articles, ...report.cards].filter((entry) => !entry.readerCopy.ok).map((entry) => `${entry.id}: ${entry.readerCopy.reasons.join('|')}`),
    [],
  );
});

test('homepage cards without an article page are audited as reader copy', () => {
  const card = { id: 'signal', articlePagePublished: false, signalCardOnly: true, homepagePublished: true, title: 'A signal card', deck: 'A clean stored deck.' };
  const rendered = { id: 'signal', title: 'A signal card', deck: 'The supplied extract reports a benchmark.', why_it_matters: 'Clean.', image_alt: 'Clean visual' };
  const report = auditReaderCopy({ latest: [card] }, { homepageSignals: [rendered] });
  assert.equal(report.publishedRecords, 0);
  assert.equal(report.homepageCards, 1);
  assert.equal(report.readerCopyFlaggedCards, 1);
  assert.deepEqual(report.cards[0].readerCopy.reasons, ['reader_copy:input_provenance:deck']);
  // The presentation built from the stored record behind a clean rendered card is checked too
  // (the persisted deck wins over the top-level deck, and is reported as the rendered deck).
  const stored = { ...card, public_presentation: { deck: 'I will not invent numbers.' } };
  const storedReport = auditReaderCopy({ latest: [stored] }, { homepageSignals: [{ ...rendered, deck: 'Clean rendered deck.' }] });
  assert.deepEqual(storedReport.cards[0].readerCopy.reasons, ['reader_copy:process_assurance:deck']);
  // A card that also has a published article page is reported once, as an article.
  const article = { ...card, articlePagePublished: true, expertLensFull: { finalArticleBody: 'Clean body.' } };
  const articleReport = auditReaderCopy({ latest: [article] }, { homepageSignals: [rendered] });
  assert.equal(articleReport.homepageCards, 0);
  assert.deepEqual(articleReport.articles[0].readerCopy.reasons, ['reader_copy:input_provenance:deck']);
});

test('strict mode fails only when a published record is flagged', (t) => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'reader-copy-gate-'));
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  fs.mkdirSync(path.join(cwd, 'src/data'), { recursive: true });
  const write = (records) => {
    for (const name of COLLECTIONS) fs.writeFileSync(path.join(cwd, 'src/data', `${name}.json`), JSON.stringify(records[name] || []));
  };
  // main() applies the real route gates, so the fixtures are columns (whose gate is self-contained).
  const clean = { id: 'clean', slug: 'clean', content_origin: 'authored', authored_quality: { ok: true }, title: 'A specific headline', expertLensFull: { finalArticleBody: 'EIA provided excerpts from the filing.' } };
  write({ 'authored-columns': [clean] });
  assert.equal(main(['--strict', '--out', 'report.json'], cwd), 0);
  const cleanReport = JSON.parse(fs.readFileSync(path.join(cwd, 'report.json'), 'utf8'));
  assert.equal(cleanReport.readerCopyFlaggedArticles, 0);

  const leaked = { ...clean, id: 'leaked', slug: 'leaked', corrections: [{ date: '2026-10-11', summary: 'Rebuilt from the supplied extract.' }] };
  write({ 'authored-columns': [clean, leaked, { ...leaked, id: 'private', slug: 'private', draft: true }] });
  assert.equal(main(['--strict', '--out', 'report.json'], cwd), 1);
  const report = JSON.parse(fs.readFileSync(path.join(cwd, 'report.json'), 'utf8'));
  assert.equal(report.readerCopyFlaggedArticles, 1);
  assert.deepEqual(report.articles.find((article) => article.id === 'leaked').readerCopy.reasons, ['reader_copy:input_provenance:corrections[0].summary']);
  // Without --strict the same inventory is reported, not failed.
  assert.equal(main(['--out', 'report.json'], cwd), 0);
});

test('columns are scoped by the column route predicate, not the news-article flag', () => {
  const column = {
    id: 'col_legacy', slug: 'legacy', title: 'A legacy column without the news flag', content_origin: 'authored',
    draft: false, public_status: 'published', authored_quality: { ok: true },
    expertLensFull: { finalArticleBody: 'The extract I have does not report production latency.' },
  };
  const report = auditReaderCopy({ 'authored-columns': [column] });
  assert.equal(report.publishedRecords, 1);
  assert.equal(report.articles[0].path, '/column/legacy/');
  assert.deepEqual(report.articles[0].readerCopy.reasons, ['reader_copy:writer_extract:expertLensFull.finalArticleBody']);
  // A draft column has no page and is not audited; a news record still needs the flag.
  assert.equal(auditReaderCopy({ 'authored-columns': [{ ...column, draft: true }] }).publishedRecords, 0);
  assert.equal(auditReaderCopy({ latest: [{ ...column, content_origin: undefined, slug: undefined }] }).publishedRecords, 0);
});

test('rendered reader-impact pills are part of the card audit', () => {
  const card = { id: 'signal', articlePagePublished: false, signalCardOnly: true, homepagePublished: true, title: 'A signal card', deck: 'A clean stored deck.' };
  const rendered = { id: 'signal', title: 'A signal card', deck: 'Clean rendered deck.', why_it_matters: 'Clean.', image_alt: 'Clean visual', reader_impact: ['Operators', 'I will not invent numbers'] };
  const report = auditReaderCopy({ latest: [card] }, { homepageSignals: [rendered] });
  assert.deepEqual(report.cards[0].readerCopy.reasons, ['reader_copy:process_assurance:public_presentation.reader_impact[1]']);
  assert.ok(publicCardSignalsFor([]).every((signal) => 'reader_impact' in signal));
});

test('rendered card metadata chips are part of the card audit', () => {
  const card = { id: 'signal', articlePagePublished: false, signalCardOnly: true, homepagePublished: true, title: 'A signal card', deck: 'A clean stored deck.' };
  const rendered = { id: 'signal', title: 'A signal card', deck: 'Clean rendered deck.', why_it_matters: 'Clean.', image_alt: 'Clean visual', reader_impact: ['Operators'], signal_label: 'Signal', editorial_lens: 'I will not invent numbers', lane_title: 'Operator Alerts', region: 'US', source: 'the supplied extract', category: 'Power & Grid' };
  const report = auditReaderCopy({ latest: [card] }, { homepageSignals: [rendered] });
  assert.deepEqual(report.cards[0].readerCopy.reasons, [
    'reader_copy:process_assurance:public_routing.editorial_lens',
    'reader_copy:input_provenance:source',
  ]);
  for (const field of ['signal_label', 'editorial_lens', 'region', 'source', 'category']) {
    assert.ok(publicCardSignalsFor([]).every((signal) => field in signal));
  }
});

test('a card-only record is audited on the fields that feed the card, not on an unreachable body', () => {
  const card = {
    id: 'signal', articlePagePublished: false, signalCardOnly: true, homepagePublished: true, title: 'A signal card', deck: 'A clean stored deck.',
    body: 'The supplied extract reports a benchmark.',
    expertLensFull: { finalHeadline: 'A clean headline', finalArticleBody: 'The extract I have does not report latency.' },
    figures: [{ title: 'the supplied extract' }], corrections: [{ date: '2026-10-11', summary: 'return strict JSON' }],
  };
  const rendered = { id: 'signal', title: 'A signal card', deck: 'Clean rendered deck.', why_it_matters: 'Clean.', image_alt: 'Clean visual' };
  const clean = auditReaderCopy({ latest: [card] }, { homepageSignals: [rendered] });
  assert.equal(clean.readerCopyFlaggedCards, 0);
  // A stored field that does feed the card is still checked, through the presentation built from it
  // (the final headline becomes the card title and the derived image alt).
  const leaked = auditReaderCopy({ latest: [{ ...card, expertLensFull: { ...card.expertLensFull, finalHeadline: 'the supplied extract' } }] }, { homepageSignals: [rendered] });
  assert.deepEqual(leaked.cards[0].readerCopy.reasons, ['reader_copy:input_provenance:title', 'reader_copy:input_provenance:imageAlt']);
  // The same record with an article page is audited in full.
  const page = auditReaderCopy({ latest: [{ ...card, articlePagePublished: true }] }, { homepageSignals: [rendered] });
  assert.ok(page.articles[0].readerCopy.reasons.includes('reader_copy:writer_extract:expertLensFull.finalArticleBody'));
});

test('the audit checks the presentation each page and card actually renders', () => {
  const base = { id: 'page-only', slug: 'page-only', articlePagePublished: true, homepagePublished: false, title: 'A page-only article', expertLensFull: { finalArticleBody: 'A clean final body.' } };
  // A persisted deck leaking writer-only language is caught without any feed signal.
  const leaked = auditReaderCopy({ latest: [{ ...base, public_presentation: { deck: 'The supplied extract reports a benchmark.' } }] });
  assert.ok(leaked.articles[0].readerCopy.reasons.includes('reader_copy:input_provenance:deck'));
  // So is a deck the renderer synthesizes from source text when no deck is stored (page outside the feeds).
  const synthesized = auditReaderCopy({ latest: [{ ...base, title: 'Grid delivery sets the schedule for a 300 MW campus', articleText: 'The supplied extract reports a 300 MW interconnection delay for the campus. Utility planners expect delivery in 2029. '.repeat(6) }] });
  assert.deepEqual(synthesized.articles[0].readerCopy.reasons, ['reader_copy:input_provenance:deck']);
  // A stale top-level deck shadowed by a clean persisted deck is not reader copy, for a page or for a card-only record.
  const shadowedPage = auditReaderCopy({ latest: [{ ...base, deck: 'The supplied extract reports a benchmark.', public_presentation: { deck: 'A clean persisted deck for readers.' } }] });
  assert.equal(shadowedPage.readerCopyFlaggedArticles, 0, shadowedPage.articles[0].readerCopy.reasons.join('|'));
  const card = { id: 'signal', articlePagePublished: false, signalCardOnly: true, homepagePublished: true, title: 'A signal card', deck: 'The supplied extract reports a benchmark.', public_presentation: { deck: 'A clean persisted deck for readers.' } };
  const rendered = { id: 'signal', title: 'A signal card', deck: 'A clean persisted deck for readers.', why_it_matters: 'Clean.', image_alt: 'Clean visual' };
  const shadowedCard = auditReaderCopy({ latest: [card] }, { homepageSignals: [rendered] });
  assert.equal(shadowedCard.readerCopyFlaggedCards, 0, shadowedCard.cards[0].readerCopy.reasons.join('|'));
});

test('a column with a leaked direct deck is flagged even when a clean presentation deck exists', () => {
  const column = {
    id: 'col', slug: 'col', collection: 'authored-columns', content_origin: 'authored', title: 'A column', draft: false, authored_quality: { ok: true },
    deck: 'The supplied extract reports a benchmark.', public_presentation: { deck: 'A clean persisted deck.' },
    expertLensFull: { finalArticleBody: 'A clean final body.' },
  };
  const report = auditReaderCopy({ 'authored-columns': [column] });
  assert.equal(report.readerCopyFlaggedArticles, 1);
  assert.deepEqual(report.articles[0].readerCopy.reasons, ['reader_copy:input_provenance:deck']);
});

test('a card-only record is audited on the raw title and source that hub and entity lists render', () => {
  const card = {
    id: 'signal', articlePagePublished: false, signalCardOnly: true, homepagePublished: true,
    title: 'The supplied extract reports a benchmark', source: 'HPCwire',
    expertLensFull: { finalHeadline: 'A clean headline' }, public_presentation: { deck: 'A clean persisted deck.' },
  };
  const rendered = { id: 'signal', title: 'A clean headline', deck: 'A clean persisted deck.', why_it_matters: 'Clean.', image_alt: 'Clean visual' };
  const report = auditReaderCopy({ latest: [card] }, { homepageSignals: [rendered] });
  assert.deepEqual(report.cards[0].readerCopy.reasons, ['reader_copy:input_provenance:title']);
  const leakedSource = auditReaderCopy({ latest: [{ ...card, title: 'A clean title', source: 'the supplied extract' }] }, { homepageSignals: [rendered] });
  assert.deepEqual(leakedSource.cards[0].readerCopy.reasons, ['reader_copy:input_provenance:source']);
});

test('a news record is in scope only when the route gates other than reader copy accept it', () => {
  const routeOptions = { sourceRegistry: authorizedAdminSourceRegistry(), now: '2026-08-10T00:00:00.000Z' };
  const published = canonicalAdminArticle({ published: true });
  assert.equal(defaultNewsPageEligible(published, routeOptions), true);
  // Hidden by a non-copy gate: no page, not audited even with a leaked body.
  for (const hidden of [
    { ...published, public_status: 'quarantined' },
    { ...published, archiveOnly: true },
    { ...published, signalCardOnly: true },
    { id: 'flag-only', articlePagePublished: true, title: 'No source authorization', expertLensFull: { finalArticleBody: 'The supplied extract reports a benchmark.' } },
  ]) {
    const leakedHidden = { ...hidden, expertLensFull: { ...hidden.expertLensFull, finalArticleBody: `${hidden.expertLensFull.finalArticleBody}\n\nThe supplied extract reports a benchmark.` } };
    assert.equal(defaultNewsPageEligible(leakedHidden, routeOptions), false);
    assert.equal(auditWithRouteGates({ latest: [leakedHidden] }, { routeOptions }).publishedRecords, 0);
  }
  // Rejected only for reader copy: still in scope, and flagged.
  const leaked = { ...published, public_presentation: { ...(published.public_presentation || {}), deck: 'The supplied extract reports a benchmark.' } };
  assert.equal(defaultNewsPageEligible(leaked, routeOptions), true);
  const report = auditWithRouteGates({ latest: [leaked] }, { routeOptions });
  assert.equal(report.publishedRecords, 1);
  assert.ok(report.articles[0].readerCopy.reasons.includes('reader_copy:input_provenance:deck'), report.articles[0].readerCopy.reasons.join('|'));
});

test('a page record with a feed card is audited on the raw title the hub lists render', () => {
  const page = { id: 'page', slug: 'page', articlePagePublished: true, homepagePublished: false, title: 'The supplied extract reports a benchmark', expertLensFull: { finalHeadline: 'A clean headline', finalArticleBody: 'A clean final body.' }, public_presentation: { deck: 'A clean persisted deck.' } };
  // Page-only: nothing prints the raw title, the final headline wins everywhere.
  const pageOnly = auditReaderCopy({ latest: [page] });
  assert.equal(pageOnly.readerCopyFlaggedArticles, 0, pageOnly.articles[0].readerCopy.reasons.join('|'));
  // The same record with a feed card appears in hub and entity lists by its raw title.
  const rendered = { id: 'page', title: 'A clean headline', deck: 'A clean persisted deck.', why_it_matters: 'Clean.', image_alt: 'Clean visual' };
  const listed = auditReaderCopy({ latest: [{ ...page, homepagePublished: true }] }, { homepageSignals: [rendered] });
  assert.deepEqual(listed.articles[0].readerCopy.reasons, ['reader_copy:input_provenance:title']);
});

test('every rendered variant of a card is audited, not only the first', () => {
  const card = { id: 'signal', articlePagePublished: false, signalCardOnly: true, homepagePublished: true, title: 'A signal card', deck: 'A clean stored deck.' };
  const homepage = { id: 'signal', title: 'A signal card', deck: 'A clean homepage deck.', why_it_matters: 'Clean.', image_alt: 'Clean visual' };
  const archive = { ...homepage, deck: 'The supplied extract reports a benchmark.' };
  const report = auditReaderCopy({ latest: [card] }, { homepageSignals: [homepage, archive] });
  assert.equal(report.homepageCards, 1);
  assert.equal(report.cards[0].variants, 2);
  assert.deepEqual(report.cards[0].readerCopy.reasons, ['reader_copy:input_provenance:deck']);
  // A page record with two variants is checked on both as well.
  const page = { ...card, articlePagePublished: true, expertLensFull: { finalArticleBody: 'A clean final body.' } };
  const pageReport = auditReaderCopy({ latest: [page] }, { homepageSignals: [homepage, archive] });
  assert.deepEqual(pageReport.articles[0].readerCopy.reasons, ['reader_copy:input_provenance:deck']);
  // Identical variants collapse to one.
  assert.equal(publicCardSignalsFor([]).length, 0);
});

test('a page without a card is audited on the detail route only', () => {
  const page = { id: 'page', slug: 'page', articlePagePublished: true, homepagePublished: false, title: 'A page', why_it_matters: 'The supplied extract reports a benchmark.', public_presentation: { deck: 'A clean persisted deck.', reader_impact: ['the supplied extract'] }, expertLensFull: { finalArticleBody: 'A clean final body.' } };
  const pageOnly = auditReaderCopy({ latest: [page] });
  assert.equal(pageOnly.readerCopyFlaggedArticles, 0, pageOnly.articles[0].readerCopy.reasons.join('|'));
  // With a feed card the record's card fields render, so the same leaks count.
  const rendered = { id: 'page', title: 'A page', deck: 'A clean persisted deck.', why_it_matters: 'Clean.', image_alt: 'Clean visual' };
  const carded = auditReaderCopy({ latest: [{ ...page, homepagePublished: true }] }, { homepageSignals: [rendered] });
  assert.ok(carded.articles[0].readerCopy.reasons.includes('reader_copy:input_provenance:why_it_matters'));
  assert.ok(carded.articles[0].readerCopy.reasons.includes('reader_copy:input_provenance:public_presentation.reader_impact[0]'));
});
