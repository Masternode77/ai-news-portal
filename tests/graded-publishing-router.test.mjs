import test from 'node:test';
import assert from 'node:assert/strict';
import { routeGradedPublishing } from '../scripts/lib/graded-publishing-router.mjs';

const cleanEvidence = [
  'The filing identifies a data center power interconnection.',
  'Cloud capacity depends on a dated substation delivery milestone.',
  'Storage procurement is scheduled before customer deployment.',
  'Memory supply is allocated to the first operating phase.',
  'The campus commissioning plan names a final energization date.',
  'The source closes with a complete construction update.',
].join(' ');

test('graded router sends clean infrastructure items to local blog routes', () => {
  const core = routeGradedPublishing({
    title: 'China data centers tap spot power trading',
    source: 'Bloomberg Technology',
    articleText: cleanEvidence,
    summary: 'China data centers are using spot power trading to manage electricity cost and grid exposure.',
    infrastructure_relevance_score: 0.78,
  });
  assert.equal(core.route, 'core_longform_blog');

  const standard = routeGradedPublishing({
    title: 'Solar-powered data center campus proposed in Lincolnshire',
    source: 'Data Center Dynamics',
    articleText: cleanEvidence,
    summary: 'The proposal connects data center siting, power procurement, and local planning.',
    infrastructure_relevance_score: 0.7,
  });
  assert.equal(standard.route, 'standard_blog');
});

test('graded router keeps weak consumer topics out of local blogs', () => {
  const deal = routeGradedPublishing({
    title: 'AMD RX GPU Amazon deal hits all-time low',
    articleText: cleanEvidence,
    infrastructure_relevance_score: 0.9,
  });
  assert.equal(deal.route, 'archive_only');
});
