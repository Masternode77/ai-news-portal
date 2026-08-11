import { readJsonFile, writeJsonFile } from './state-store.mjs';

export const PIPELINE_HEARTBEAT_PATH = 'src/data/pipeline-heartbeat.json';

export async function writePipelineHeartbeat(payload = {}, filePath = PIPELINE_HEARTBEAT_PATH) {
  const previous = await readPipelineHeartbeat(filePath);
  const lastPipelineRunAt = payload.last_pipeline_run_at || new Date().toISOString();
  const heartbeat = {
    ...previous,
    ...payload,
    last_pipeline_run_at: lastPipelineRunAt,
    last_successful_pipeline_at: payload.status === 'ok'
      ? lastPipelineRunAt
      : payload.last_successful_pipeline_at || previous.last_successful_pipeline_at || null,
  };
  await writeJsonFile(filePath, heartbeat);
  return heartbeat;
}

export async function readPipelineHeartbeat(filePath = PIPELINE_HEARTBEAT_PATH) {
  return readJsonFile(filePath, {});
}
