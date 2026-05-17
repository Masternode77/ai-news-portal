import test from 'node:test';
import assert from 'node:assert/strict';
import { routePublicLane } from '../scripts/lib/public-lane-router.mjs';

test('sports AI startup stays out of investor core lanes', () => {
  const route = routePublicLane({
    title: 'Inside Paul Tudor Jones’ Sports AI Startup',
    summary: 'SumerSports applies AI to football analytics.',
    infrastructure_relevance_score: 0.581,
  });
  assert.ok(['adjacent', 'archive'].includes(route.visibility));
  assert.notEqual(route.laneKey, 'investor-signals');
});

test('dinosaur fossil market is archive only', () => {
  const route = routePublicLane({
    title: 'Inside the Booming Market for Dinosaur Fossils',
    summary: 'A fossil auction market story.',
    infrastructure_relevance_score: 0.581,
  });
  assert.equal(route.visibility, 'archive');
});

test('legal AI tools are adjacent without infrastructure evidence', () => {
  const route = routePublicLane({
    title: 'Anthropic Expands Push Into Legal Industry With New AI Tools',
    summary: 'Claude helps legal professionals use AI tools.',
    infrastructure_relevance_score: 0.581,
  });
  assert.equal(route.visibility, 'adjacent');
});

test('NetApp OpenShift data management routes as a core platform resilience signal', () => {
  const route = routePublicLane({
    title: 'NetApp Expands OpenShift Data Management With Faster VM Backup, DR, and Cloud Scale Support',
    summary: 'NetApp and Red Hat OpenShift backup and DR support enterprise AI workloads.',
    infrastructure_layer: 'Enterprise Platform',
    infrastructure_relevance_score: 1,
  });
  assert.equal(route.visibility, 'core');
  assert.equal(route.editorial_lens, 'Platform Resilience');
});

test('China data center spot power trading routes as core power signal', () => {
  const route = routePublicLane({
    title: 'China Data Centers Tap Spot Power Trading First Time: Report',
    summary: 'Large data centers join electricity spot trading through virtual power plants.',
    infrastructure_layer: 'Power',
    infrastructure_relevance_score: 0.77,
  });
  assert.equal(route.visibility, 'core');
  assert.equal(route.editorial_lens, 'Power Market Signal');
});
