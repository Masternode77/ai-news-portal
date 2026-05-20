import test from 'node:test';
import assert from 'node:assert/strict';
import { blogEligibilityResult } from '../scripts/lib/blog-eligibility-policy.mjs';

test('blog eligibility requires clean facts and infrastructure layer', () => {
  const result = blogEligibilityResult({
    title: 'NetApp OpenShift backup update reaches enterprise platform teams',
    source: 'StorageReview',
    articleText: `${'NetApp and Red Hat OpenShift backup, disaster recovery, storage, and platform operations are discussed. '.repeat(18)}Final sentence complete.`,
    summary: 'NetApp added OpenShift data management features for backup and disaster recovery.',
    infrastructure_relevance_score: 0.9,
  }, 'standard_blog');
  assert.equal(result.ok, true);
  assert.ok(result.evidencePack.facts.length >= 3);
});
