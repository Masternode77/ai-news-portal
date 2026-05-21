import test from 'node:test';
import assert from 'node:assert/strict';
import { buildEditorialStoryV2, canGenerateFullArticle } from '../scripts/lib/editorial-story-engine-v2.mjs';

const netapp = {
  id: 'netapp',
  title: 'NetApp Expands OpenShift Data Management With Faster VM Backup, DR, and Cloud Scale Support',
  source: 'StorageReview',
  summary: 'NetApp announced data management updates for Red Hat OpenShift backup and DR.',
  articleText: 'NetApp announced a set of data management updates for Red Hat OpenShift to improve backup predictability, disaster recovery, and operational scalability across on-premises and cloud-based virtualized environments. The release focuses on OpenShift Virtualization deployments, where growing VM counts and larger datasets can make traditional full-disk backup approaches harder to operate. Platform teams can watch restore speed, DR failover validation, and cross-environment management as AI workloads move from pilot to production.',
  infrastructure_layer: 'Enterprise Platform',
  infrastructure_relevance_score: 1,
  affected_stakeholders: ['platform teams', 'enterprise IT'],
};

test('NarrativeDNA v2 full article gate requires complete source-backed evidence', () => {
  const gate = canGenerateFullArticle(netapp);
  assert.equal(gate.ok, true);
  assert.equal(gate.narrative_dna.story_archetype, 'Platform Resilience Note');
  assert.doesNotMatch(gate.narrative_dna.watch_metric, /next .* disclosure/i);
});

test('Editorial Story Engine v2 avoids banned repeated detail phrases', () => {
  const story = buildEditorialStoryV2(netapp);
  assert.equal(story.ok, true);
  assert.equal(story.generation_version, 'editorial_surface_v2');
  assert.match(story.finalArticleBody, /Platform|OpenShift|NetApp/);
  assert.doesNotMatch(story.finalArticleBody, /The useful follow-up is the next|belongs on the board only if|should read it through/i);
});
