import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { auditReaderCopy, publicCardSignalsFor, main } from '../scripts/audit-reader-copy.mjs';
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
  const clean = { id: 'clean', slug: 'clean', articlePagePublished: true, title: 'A specific headline', expertLensFull: { finalArticleBody: 'EIA provided excerpts from the filing.' } };
  write({ 'latest-news': [clean] });
  assert.equal(main(['--strict', '--out', 'report.json'], cwd), 0);
  const cleanReport = JSON.parse(fs.readFileSync(path.join(cwd, 'report.json'), 'utf8'));
  assert.equal(cleanReport.readerCopyFlaggedArticles, 0);

  const leaked = { ...clean, id: 'leaked', corrections: [{ date: '2026-10-11', summary: 'Rebuilt from the supplied extract.' }] };
  write({ 'latest-news': [clean], 'archived-news': [leaked, { ...leaked, id: 'private', articlePagePublished: false }] });
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
    'reader_copy:process_assurance:public_presentation.editorial_lens',
    'reader_copy:input_provenance:source',
  ]);
  for (const field of ['signal_label', 'editorial_lens', 'lane_title', 'region', 'source', 'category']) {
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
