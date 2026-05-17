import test from 'node:test';
import assert from 'node:assert/strict';
import { duplicateFirstWordPrefixes, forbiddenPublicPhraseMatches, guardPublicCopy } from '../scripts/lib/copy-quality-guard.mjs';
import { generateEditorialExcerpt } from '../scripts/lib/editorial-excerpt-generator.mjs';

test('NetApp excerpt is editorial and source-specific', () => {
  const excerpt = generateEditorialExcerpt({
    id: 'netapp',
    title: 'NetApp Expands OpenShift Data Management With Faster VM Backup, DR, and Cloud Scale Support',
    source: 'StorageReview',
    summary: 'NetApp announced data management updates for Red Hat OpenShift.',
    articleText: 'NetApp announced data management updates for Red Hat OpenShift backup and DR in enterprise AI environments.',
    infrastructure_layer: 'Enterprise Platform',
    infrastructure_relevance_score: 1,
    affected_stakeholders: ['platform teams'],
  });
  assert.equal(excerpt.deck, 'NetApp’s OpenShift update turns backup and DR into a platform-readiness issue for enterprise AI workloads.');
  assert.deepEqual(forbiddenPublicPhraseMatches(excerpt.deck), []);
  assert.equal(excerpt.deck.startsWith('StorageReview'), false);
});

test('copy guard catches forbidden public templates', () => {
  const result = guardPublicCopy('StorageReview raises a practical capacity question after netapp announced something.');
  assert.equal(result.ok, false);
  assert.ok(result.reasons.some((reason) => reason.includes('forbidden_phrase')));
});

test('duplicate first eight homepage words are detected', () => {
  const duplicates = duplicateFirstWordPrefixes([
    { id: 'a', text: 'NetApp OpenShift backup changes enterprise platform planning for buyers today.' },
    { id: 'b', text: 'NetApp OpenShift backup changes enterprise platform planning for buyers tomorrow.' },
  ]);
  assert.equal(duplicates.length, 1);
});
