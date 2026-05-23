import assert from 'node:assert/strict';
import test from 'node:test';
import { routeEditorialArchetypeV2 } from '../scripts/lib/editorial-archetype-router-v2.mjs';

test('archetype router chooses power/grid structure for power signals', () => {
  const archetype = routeEditorialArchetypeV2({ primary_infrastructure_layer: 'power', cluster_title: 'Grid connection pressure hits data centers' });
  assert.equal(archetype.id, 'power_grid_constraint');
  assert.ok(archetype.headings.includes('The grid bottleneck'));
});
