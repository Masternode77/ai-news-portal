import { readJsonFile, writeJsonFile } from './state-store.mjs';

export const SIGNAL_CLUSTER_STORE_PATH = 'src/data/signal-clusters.json';

export async function readSignalClusters(filePath = SIGNAL_CLUSTER_STORE_PATH) {
  return readJsonFile(filePath, []);
}

export async function writeSignalClusters(clusters = [], filePath = SIGNAL_CLUSTER_STORE_PATH) {
  await writeJsonFile(filePath, clusters);
  return clusters;
}
