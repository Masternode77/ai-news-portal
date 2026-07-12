import assert from 'node:assert/strict';
import test from 'node:test';
import { sourceGroundedPublicRelevance } from '../scripts/lib/source-grounded-public-relevance.mjs';

test('blocks generated infrastructure framing when the source is consumer technology', () => {
  const result = sourceGroundedPublicRelevance({
    title: 'HamsterOS puts a retro GUI on one floppy disk for home PCs',
    contentText: 'The operating system targets 386-era home computers and DOS software.',
    summary: 'This changes AI infrastructure power and capacity planning.',
    category: 'AI Infrastructure',
    infrastructure_relevance_score: 0.96,
    infrastructure_relevance: {
      infrastructure_relevance_score: 0.96,
      infrastructure_relevance_tier: 'signal_card',
    },
    sourceUrl: 'https://example.com/retro-gaming/hamster-os',
  });

  assert.equal(result.ok, false);
  assert.equal(result.hardNegative, true);
});

test('keeps source-grounded data center and grid reporting public', () => {
  const result = sourceGroundedPublicRelevance({
    title: 'County pauses new data center permits while the grid plan is reviewed',
    contentText: 'The county approved a six-month pause on new data center permits while its utility studies substation capacity.',
    sourceUrl: 'https://example.com/data-centers/permit-pause',
  });

  assert.equal(result.ok, true);
  assert.equal(result.hardNegative, false);
});

test('accepts a pipeline-managed brief when cleaned source text carries a physical infrastructure anchor', () => {
  const result = sourceGroundedPublicRelevance({
    title: 'Utility schedule now controls a 620 MW AI campus',
    cleaned_source_text: 'A utility filing says a 620 MW AI data center campus cannot energize until two new substations are delivered.',
    infrastructure_relevance_score: 0.94,
    public_routing: { visibility: 'adjacent' },
    sourceUrl: 'https://example.com/ai-campus',
  });

  assert.equal(result.ok, true);
  assert.equal(result.sourceAnchored, true);
});

test('blocks generic AI-agent stories even when generated copy carries infrastructure terms', () => {
  const result = sourceGroundedPublicRelevance({
    title: 'New AI agents automate software work',
    rawText: 'Generated copy links the release to data center capacity, power equipment, and server demand.',
    infrastructure_relevance_score: 0.91,
    public_routing: { visibility: 'adjacent' },
    sourceUrl: 'https://example.com/ai-agents',
  });

  assert.equal(result.ok, false);
  assert.equal(result.hardNegative, true);
});

test('does not treat a generated source-linked signal sentence as source evidence', () => {
  const result = sourceGroundedPublicRelevance({
    title: 'Azure identity and security update',
    cleaned_source_text: 'Azure identity and security update remains a source-linked AI infrastructure signal.',
    infrastructure_relevance_score: 0.88,
    public_routing: { visibility: 'adjacent' },
  });

  assert.equal(result.ok, false);
  assert.equal(result.unsafeSourceText, true);
});

test('legacy fixtures without extracted text require an explicit relevance score', () => {
  assert.equal(sourceGroundedPublicRelevance({
    title: 'Enterprise platform capacity update',
    infrastructure_relevance_score: 0.82,
  }).ok, true);
  assert.equal(sourceGroundedPublicRelevance({
    title: 'Enterprise platform update',
  }).ok, false);
});
