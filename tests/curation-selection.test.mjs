import assert from 'node:assert/strict';
import test from 'node:test';
import { curationShortlist, resolveCuratedSelection } from '../scripts/lib/curate.mjs';

const shortlist = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

test('a failed or non-JSON reply yields null so the deterministic ranker can take over', () => {
  assert.equal(resolveCuratedSelection(null, shortlist), null);
  assert.equal(resolveCuratedSelection({ selectedIds: 'a' }, shortlist), null);
});

test('an explicit empty selection is a decision, not a failure', () => {
  assert.deepEqual(resolveCuratedSelection({ selectedIds: [] }, shortlist), []);
});

test('ids outside the shortlist are dropped, and only-unknown ids count as no answer', () => {
  assert.deepEqual(resolveCuratedSelection({ selectedIds: ['b', 'zz', 'a'] }, shortlist), ['b', 'a']);
  assert.equal(resolveCuratedSelection({ selectedIds: ['zz'] }, shortlist), null);
});

test('the shortlist leads with the strongest lane rather than the newest item', () => {
  const items = [
    { id: 'fresh-audit', score: 60, infrastructure_relevance_score: 0, ai_topic_score: 0 },
    { id: 'older-grid', score: 20, infrastructure_relevance_score: 0.62, ai_topic_score: 0 },
    { id: 'ai-story', score: 30, infrastructure_relevance_score: 0.1, ai_topic_score: 0.9 },
  ];
  assert.deepEqual(curationShortlist(items).map((item) => item.id), ['ai-story', 'older-grid', 'fresh-audit']);
});
