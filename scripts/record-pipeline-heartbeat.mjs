import { writePipelineHeartbeat } from './lib/pipeline-heartbeat.mjs';

const status = process.argv[2];

if (status !== 'ok' && status !== 'failed') {
  throw new TypeError('Expected heartbeat status: ok or failed');
}

await writePipelineHeartbeat({ status });
console.log(`pipeline heartbeat recorded: ${status}`);
