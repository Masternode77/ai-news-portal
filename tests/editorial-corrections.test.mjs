import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { correctionNotes, correctionText, formatCorrectionDate } from '../scripts/lib/editorial-corrections.mjs';
import { readerCopyResult } from '../scripts/lib/reader-copy-guard.mjs';
import { buildColumnStructuredData, buildArticleStructuredData } from '../src/lib/seo-safeguards.js';

const site = { url: 'https://www.computecurrent.com', name: 'Compute Current', defaultOgImage: '/og.png' };

test('correction notes are normalized, dated and ordered', () => {
  const notes = correctionNotes({
    corrections: [
      { date: '2026-10-11', summary: '  Corrected   the chronology. ' },
      { date: '2026-09-01', summary: 'Earlier note.' },
      { date: 'yesterday', summary: 'Malformed date is dropped.' },
      { date: '2026-10-12', summary: '' },
      null,
    ],
  });
  assert.deepEqual(notes, [
    { date: '2026-09-01', summary: 'Earlier note.' },
    { date: '2026-10-11', summary: 'Corrected the chronology.' },
  ]);
  assert.deepEqual(correctionNotes({}), []);
  assert.equal(formatCorrectionDate('2026-10-11'), 'October 11, 2026');
  assert.equal(correctionText({ corrections: [{ date: '2026-10-11', summary: 'Fixed a date.' }] }), 'October 11, 2026: Fixed a date.');
});

test('structured data carries the correction only when a note exists', () => {
  const column = { title: 'A column', publishedAt: '2026-08-20T00:00:00.000Z', updatedAt: '2026-10-11T00:00:00.000Z', corrections: [{ date: '2026-10-11', summary: 'Corrected the lease accounting description.' }] };
  const withNote = buildColumnStructuredData({ column, site, canonicalUrl: 'https://www.computecurrent.com/column/a/' });
  assert.equal(withNote.correction, 'October 11, 2026: Corrected the lease accounting description.');
  assert.equal(withNote.dateModified, '2026-10-11T00:00:00.000Z');
  const withoutNote = buildColumnStructuredData({ column: { title: 'B', publishedAt: '2026-08-20T00:00:00.000Z' }, site, canonicalUrl: 'https://www.computecurrent.com/column/b/' });
  assert.equal('correction' in withoutNote, false);
  const article = buildArticleStructuredData({
    article: { id: 'x', publishedAt: '2026-08-12T00:00:00.000Z', corrections: [{ date: '2026-10-11', summary: 'Added source figures.' }] },
    site, title: 'X', description: 'Y', image: '/img.png', canonicalUrl: 'https://www.computecurrent.com/news/x/', taxonomy: {},
  });
  assert.equal(article.correction, 'October 11, 2026: Added source figures.');
});

test('correction summaries are reader-facing copy for the guard', () => {
  assert.equal(readerCopyResult({ corrections: [{ date: '2026-10-11', summary: 'Removed references to the supplied extract.' }] }).ok, false);
  assert.equal(readerCopyResult({ corrections: [{ date: '2026-10-11', summary: 'Corrected the project chronology.' }] }).ok, true);
});

test('article templates render the correction note after the body', () => {
  const column = fs.readFileSync('src/pages/column/[slug].astro', 'utf8');
  const news = fs.readFileSync('src/pages/news/[id].astro', 'utf8');
  const component = fs.readFileSync('src/components/EditorialCorrectionNote.astro', 'utf8');
  assert.match(column, /<EditorialCorrectionNote record=\{columnRecord\} \/>/);
  assert.match(news, /<EditorialCorrectionNote record=\{articleRecord\} \/>/);
  assert.ok(news.indexOf('EditorialCorrectionNote record') > news.indexOf('LongformArticleBody blocks'));
  assert.match(component, /aria-label="Corrections and updates"/);
  assert.match(component, /<time datetime=\{note\.date\}>/);
});
