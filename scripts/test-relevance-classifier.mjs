import assert from 'node:assert/strict';
import {
  FULL_MEMO_RELEVANCE_THRESHOLD,
  SIGNAL_CARD_RELEVANCE_THRESHOLD,
  classifyInfrastructureRelevance,
  splitByInfrastructureRelevance,
} from './lib/relevance-classifier.mjs';
import { splitLatestAndArchive } from './lib/archive-store.mjs';

const fullMemo = classifyInfrastructureRelevance({
  id: 'grid-data-center',
  title: 'Utility pauses AI data center grid connections after requests hit 60 GW',
  snippet: 'Data center developers face interconnection and substation limits for AI campuses.',
  contentText: 'Power procurement and cloud capacity timing are now bottlenecks for new GPU clusters.',
});

assert.ok(fullMemo.infrastructure_relevance_score >= FULL_MEMO_RELEVANCE_THRESHOLD);
assert.equal(fullMemo.infrastructure_relevance_tier, 'full_memo');
assert.equal(fullMemo.infrastructure_relevance_action, 'generate_full_memo');
assert.ok(fullMemo.direct_ai_infrastructure_relevance >= 0.75);
assert.ok(fullMemo.data_center_relevance >= 0.45);
assert.ok(fullMemo.power_grid_relevance >= 0.75);

const signalCard = classifyInfrastructureRelevance({
  id: 'enterprise-ai-backup',
  title: 'Backup vendor adds disaster recovery for AI workloads',
  snippet: 'Enterprise teams running inference workloads get better recovery tooling.',
  contentText: 'The update is relevant to platform operations but does not change facility capacity.',
});

assert.ok(signalCard.infrastructure_relevance_score >= SIGNAL_CARD_RELEVANCE_THRESHOLD);
assert.ok(signalCard.infrastructure_relevance_score < FULL_MEMO_RELEVANCE_THRESHOLD);
assert.equal(signalCard.infrastructure_relevance_tier, 'signal_card');
assert.equal(signalCard.infrastructure_relevance_action, 'publish_signal_card_only');
assert.equal(signalCard.articlePagePublished, false);

const archiveOnly = classifyInfrastructureRelevance({
  id: 'consumer-ai-video',
  title: 'Startup launches AI video app for creators',
  snippet: 'The consumer app adds a chatbot and image generator for social media clips.',
  contentText: 'The launch is about creator workflows, with no infrastructure, capacity, cloud, chip, power, or cooling surface.',
});

assert.ok(archiveOnly.infrastructure_relevance_score < SIGNAL_CARD_RELEVANCE_THRESHOLD);
assert.equal(archiveOnly.infrastructure_relevance_tier, 'archive_only');
assert.equal(archiveOnly.homepagePublished, false);
assert.equal(archiveOnly.archiveOnly, true);

const split = splitByInfrastructureRelevance([
  {
    id: 'full',
    title: 'AI data center adds liquid cooling and power capacity',
    snippet: 'The campus expands GPU cluster capacity with new substations.',
  },
  {
    id: 'signal',
    title: 'Backup vendor adds disaster recovery for AI workloads',
    snippet: 'Enterprise teams running inference workloads get better recovery tooling.',
  },
  {
    id: 'archive',
    title: 'Startup launches AI video app for creators',
    snippet: 'The consumer app adds a chatbot for social media clips.',
  },
]);

assert.equal(split.fullMemoCandidates.length, 1);
assert.equal(split.signalCards.length, 1);
assert.equal(split.archiveOnly.length, 1);
assert.equal(split.archiveOnly[0].homepagePublished, false);

const { latest, overflow } = splitLatestAndArchive([
  {
    id: 'archive-only-recent',
    title: 'Generic AI app update',
    publishedAt: '2026-05-17T12:00:00.000Z',
    homepagePublished: false,
    archiveOnly: true,
  },
  {
    id: 'homepage-older',
    title: 'AI data center power update',
    publishedAt: '2026-05-17T10:00:00.000Z',
  },
]);

assert.equal(latest.length, 1);
assert.equal(latest[0].id, 'homepage-older');
assert.equal(overflow.length, 1);
assert.equal(overflow[0].id, 'archive-only-recent');

console.log('relevance classifier test passed');
