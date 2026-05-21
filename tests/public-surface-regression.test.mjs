import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPublicPresentation } from '../scripts/lib/public-presentation.mjs';
import { routePublicLane } from '../scripts/lib/public-lane-router.mjs';

test('public presentation exposes editorial fields without numeric QA metadata', () => {
  const article = {
    id: 'memory',
    title: 'Striking Back at AI Memory Pricing Using AI',
    source: 'ServeTheHome',
    summary: 'The same concept applies across Proxmox, KVM, Hyper-V, Nutanix, and XCP-ng estates.',
    articleText: 'The same concept applies across Proxmox, KVM, Hyper-V, Nutanix, and XCP-ng estates where memory pricing changes virtualization planning.',
    infrastructure_layer: 'Enterprise Platform',
    infrastructure_relevance_score: 0.972,
    urgency_score: 0.8,
    extraction_quality_score: 1,
    article_blueprint: 'constraint-ledger',
    articlePagePublished: true,
    affected_stakeholders: ['enterprise buyers', 'platform teams'],
  };
  const presentation = buildPublicPresentation(article, { route: routePublicLane(article) });
  assert.equal(presentation.deck, 'AI memory pricing is starting to hit virtualization planning, not just GPU procurement.');
  assert.equal('relevance_score' in presentation, false);
  assert.equal('urgency_score' in presentation, false);
  assert.equal('extraction_quality_score' in presentation, false);
  assert.equal('article_blueprint' in presentation, false);
});
