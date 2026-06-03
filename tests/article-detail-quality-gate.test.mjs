import test from 'node:test';
import assert from 'node:assert/strict';
import { articleDetailQualityResult } from '../scripts/lib/article-detail-quality-gate.mjs';

test('rejects detail pages with fixed Editor Brief template', () => {
  const article = {
    id: 'bad-detail',
    title: 'China data centers tap spot power trading',
    infrastructure_relevance_score: 0.9,
    articleText: `${'China spot power trading creates a grid-market operating lever for large data centers. '.repeat(25)}Final sentence complete.`,
    expertLensFull: {
      finalArticleBody: `${'China spot power trading creates a grid-market operating lever for large data centers. '.repeat(15)}\n\nEditor's Brief\n\nThe next signal to watch is customer commitments.`,
    },
  };
  const result = articleDetailQualityResult(article);
  assert.equal(result.ok, false);
  assert.ok(result.reasons.includes('fixed_editors_brief_template'));
});

test('accepts clean longform infrastructure article body', () => {
  const body = [
    'China’s spot power trading pilot gives large data centers a different operating lever because load flexibility can change how operators manage procurement exposure.',
    'The infrastructure question is whether that market mechanism lowers volatility for large facilities or simply shifts risk from fixed contracts into shorter price windows.',
    'Operators benefit if virtual power plant participation creates dispatch value, while buyers remain exposed if volatility erodes predictable energy cost.',
    'Power teams should watch participation volumes, price dispersion, and whether large data centers can translate flexible load into repeatable procurement advantage.',
    'The bottom line is that power-market design is becoming part of data center operating strategy, not a separate utility-policy footnote.',
  ].join('\n\n');
  const article = {
    id: 'good-detail',
    title: 'China data centers tap spot power trading',
    infrastructure_relevance_score: 0.9,
    articleText: `${'China spot power trading creates a grid-market operating lever for large data centers and virtual power plant participation. '.repeat(25)}Final sentence complete.`,
    expertLensFull: { finalArticleBody: body },
  };
  const result = articleDetailQualityResult(article);
  assert.equal(result.ok, true);
});

test('rejects detail pages without enough visible article sections', () => {
  const body = `${'Power procurement and delivery timing remain the operating constraint for AI infrastructure buyers and data center developers. '.repeat(10)}Final sentence complete.`;
  const article = {
    id: 'flat-detail',
    title: 'Power procurement shifts data center timing',
    infrastructure_relevance_score: 0.9,
    articleText: `${'Power procurement and delivery timing remain the operating constraint for AI infrastructure buyers and data center developers. '.repeat(25)}Final sentence complete.`,
    expertLensFull: { finalArticleBody: body },
  };

  const result = articleDetailQualityResult(article);

  assert.equal(result.ok, false);
  assert.ok(result.reasons.includes('article_body_too_few_sections'));
});
