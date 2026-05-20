import { readJsonFile, writeJsonFile } from './state-store.mjs';

export const PIPELINE_HEARTBEAT_PATH = 'src/data/pipeline-heartbeat.json';

export async function writePipelineHeartbeat(payload = {}, filePath = PIPELINE_HEARTBEAT_PATH) {
  const heartbeat = {
    last_pipeline_run_at: new Date().toISOString(),
    ...payload,
  };
  await writeJsonFile(filePath, heartbeat);
  return heartbeat;
}

export async function readPipelineHeartbeat(filePath = PIPELINE_HEARTBEAT_PATH) {
  return readJsonFile(filePath, {});
}
