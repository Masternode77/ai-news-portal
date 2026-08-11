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
  const paragraph = 'China’s spot power trading pilot gives large data centers a different operating lever because load flexibility can change how operators manage procurement exposure, while power teams watch participation volumes, price dispersion, utility milestones, and repeatable procurement advantage.';
  const body = Array.from({ length: 5 }, (_, section) => [
    `Operating Decision ${section + 1}`,
    `${paragraph} ${paragraph}`,
    `${paragraph} ${paragraph}`,
  ].join('\n\n')).join('\n\n');
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
  assert.ok(result.reasons.includes('sections_below_5'));
});

test('rejects a structured local detail article below the shared 4500-character longform contract', () => {
  // Given: source extraction passes, but the generated detail body is only about 1,000 characters.
  const source = `${'Utility filings document transformer delivery, interconnection timing, customer commitments, and campus commissioning milestones. '.repeat(20)}Final source sentence complete.`;
  const body = [
    'What changed',
    'Utility timing now controls the campus schedule and capacity procurement plan for operators.',
    'Who benefits',
    'Buyers benefit from firm milestones while developers retain delay exposure across equipment delivery.',
    'What to watch',
    'Teams should watch transformer delivery, service agreements, and commissioning evidence before revising plans.',
  ].join('\n\n').repeat(3);

  // When: the article-detail quality gate evaluates the candidate.
  const result = articleDetailQualityResult({
    id: 'short-structured-detail',
    title: 'Utility timing controls campus commissioning',
    infrastructure_relevance_score: 0.9,
    articleText: source,
    blog_route: 'standard_blog',
    expertLensFull: { finalArticleBody: body },
  });

  // Then: no implicit intermediate detail tier is accepted.
  assert.equal(result.ok, false);
  assert.ok(result.reasons.includes('visible_body_below_4500'));
});
