import assert from 'node:assert/strict';
import test from 'node:test';
import { clusterSignalItems } from '../scripts/lib/signal-clusterer.mjs';

test('signal clusterer groups related source items around one signal', () => {
  const items = [
    { id: 'a', title: 'Denmark data center grid connection pause', cleaned_text: 'Denmark paused new data center grid connections as requests reached 60 GW.', source_published_at: '2026-05-20T00:00:00Z', source_name: 'Source A', infrastructure_layer: 'power', companies: ['Denmark'], numeric_claims: [{ raw: '60 GW' }], extracted_facts: ['Denmark paused new data center grid connections.'] },
    { id: 'b', title: 'Denmark data center grid connection pause', cleaned_text: 'Nordic grid pressure is slowing data center interconnection planning.', source_published_at: '2026-05-20T01:00:00Z', source_name: 'Source B', infrastructure_layer: 'power', companies: ['Denmark'], numeric_claims: [], extracted_facts: ['Nordic grid pressure is slowing data center planning.'] },
  ];
  const clusters = clusterSignalItems(items);
  assert.equal(clusters.length, 1);
  assert.equal(clusters[0].source_count, 2);
});
