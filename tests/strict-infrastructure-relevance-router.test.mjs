import test from 'node:test';
import assert from 'node:assert/strict';
import { routeStrictInfrastructureRelevance } from '../scripts/lib/strict-infrastructure-relevance-router.mjs';

const base = {
  infrastructure_relevance_score: 0.9,
  articleText: `${'Clean source evidence about data center power, storage, or semiconductor capacity. '.repeat(20)}Final sentence complete.`,
};

test('archives consumer deals and non-infrastructure items', () => {
  assert.equal(routeStrictInfrastructureRelevance({ ...base, title: 'AMD RX 9070 GPU Amazon deal hits all-time low' }).visibility, 'archive');
  assert.equal(routeStrictInfrastructureRelevance({ ...base, title: 'Dell XPS laptop review: a nice consumer PC' }).visibility, 'archive');
  assert.equal(routeStrictInfrastructureRelevance({ ...base, title: 'AI commencement speech draws attention from graduates' }).visibility, 'archive');
  assert.equal(routeStrictInfrastructureRelevance({ ...base, title: 'LinkedIn recruitment spam prompt injection spreads' }).visibility, 'archive');
});

test('keeps adjacent boundary items out of core lanes', () => {
  const sports = routeStrictInfrastructureRelevance({ ...base, title: 'Paul Tudor Jones backs sports AI startup', articleText: 'SumerSports builds football analytics software.' });
  assert.notEqual(sports.visibility, 'core');
  const paper = routeStrictInfrastructureRelevance({ ...base, title: 'arXiv AI paper ban sparks debate', articleText: 'Researchers debate model policy without compute infrastructure details.' });
  assert.notEqual(paper.visibility, 'core');
});

test('routes clean infrastructure items into core lanes', () => {
  assert.equal(routeStrictInfrastructureRelevance({ ...base, title: 'China data centers tap spot power trading', articleText: `${base.articleText} China spot power trading gives data centers a grid-market operating lever.` }).visibility, 'core');
  assert.equal(routeStrictInfrastructureRelevance({ ...base, title: 'Texas county data center moratorium raises siting risk', articleText: `${base.articleText} A county moratorium affects data center permitting and grid planning.` }).visibility, 'core');
  assert.equal(routeStrictInfrastructureRelevance({ ...base, title: 'NetApp OpenShift data management update', articleText: `${base.articleText} NetApp and Red Hat OpenShift backup and disaster recovery affect enterprise platform infrastructure.` }).visibility, 'core');
});
