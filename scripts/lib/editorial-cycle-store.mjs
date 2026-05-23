import { readJsonFile, writeJsonFile } from './state-store.mjs';

export const EDITORIAL_CYCLE_STORE_PATH = 'src/data/editorial-cycles.json';

export async function readEditorialCycles(filePath = EDITORIAL_CYCLE_STORE_PATH) {
  return readJsonFile(filePath, []);
}

export async function writeEditorialCycles(cycles = [], filePath = EDITORIAL_CYCLE_STORE_PATH) {
  await writeJsonFile(filePath, cycles);
  return cycles;
}

export async function appendEditorialCycle(cycle = {}, filePath = EDITORIAL_CYCLE_STORE_PATH) {
  const cycles = await readEditorialCycles(filePath);
  const out = [cycle, ...cycles.filter((item) => item.cycle_id !== cycle.cycle_id)].slice(0, 80);
  await writeEditorialCycles(out, filePath);
  return out;
}

export function latestEditorialCycle(cycles = []) {
  return [...cycles].sort((a, b) => new Date(b.cycle_started_at || 0) - new Date(a.cycle_started_at || 0))[0] || null;
}
