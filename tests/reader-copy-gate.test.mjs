import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { auditReaderCopy, homepageSignalsFor, main } from '../scripts/audit-reader-copy.mjs';

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
  const homepageSignals = homepageSignalsFor([...collections['latest-news'], ...collections['archived-news']]);
  assert.ok(homepageSignals.length >= 30, `homepage renders ${homepageSignals.length} cards`);
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
  // The stored record behind a clean rendered card is checked too (persisted presentation copy).
  const stored = { ...card, public_presentation: { deck: 'I will not invent numbers.' } };
  const storedReport = auditReaderCopy({ latest: [stored] }, { homepageSignals: [{ ...rendered, deck: 'Clean rendered deck.' }] });
  assert.deepEqual(storedReport.cards[0].readerCopy.reasons, ['reader_copy:process_assurance:public_presentation.deck']);
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
