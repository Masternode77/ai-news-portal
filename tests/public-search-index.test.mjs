import test from 'node:test';
import assert from 'node:assert/strict';
import { routePublicLane } from '../scripts/lib/public-lane-router.mjs';
import { publicSearchEligible } from '../scripts/lib/public-search-index.mjs';

test('public homepage search excludes archive-only stories', () => {
  const dinosaur = {
    title: 'Inside the Booming Market for Dinosaur Fossils',
    summary: 'A fossil auction market story.',
    infrastructure_relevance_score: 0.58,
  };
  const route = routePublicLane(dinosaur);
  assert.equal(route.visibility, 'archive');
  assert.equal(publicSearchEligible(dinosaur, route), false);
});

test('generic commencement stories are archived before public search', () => {
  const commencement = {
    title: 'NVIDIA CEO Tells Graduates Their Career Starts at the Beginning of the AI Revolution',
    summary: 'A commencement ceremony speech for university graduates with no infrastructure deployment facts.',
    infrastructure_relevance_score: 0.91,
  };
  const route = routePublicLane(commencement);
  assert.equal(route.visibility, 'archive');
  assert.equal(publicSearchEligible(commencement, route), false);
});
