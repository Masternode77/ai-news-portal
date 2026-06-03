#!/usr/bin/env node
import { runContentCycleForFixture } from './run-content-cycle.mjs';
import { writePipelineHeartbeat } from './lib/pipeline-heartbeat.mjs';

const fixture = process.env.CONTENT_CYCLE_FIXTURE || 'tests/fixtures/content-cycle-mixed.json';

try {
  const result = await runContentCycleForFixture(fixture, { now: new Date().toISOString() });
  await writePipelineHeartbeat({
    status: 'ok',
    content_cycle: result.summary || {},
    review_queue_count: result.artifacts?.adminReviewQueue?.length || 0,
  });
  console.log(`content cycle scheduled: published=${result.summary?.published || 0} review=${result.summary?.reviewQueue || 0}`);
} catch (error) {
  await writePipelineHeartbeat({ status: 'failed', error: error.message });
  console.error(`content cycle failed: ${error.message}`);
  process.exit(1);
}
