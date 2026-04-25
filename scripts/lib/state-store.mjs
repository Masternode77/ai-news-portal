import fs from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_STATE = {
  publishedIds: [],
  dayPlans: {},
  runHistory: [],
  lastRunAt: null,
};

async function ensureDir(filePath) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

export async function readJsonFile(filePath, defaultValue) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return defaultValue;
  }
}

export async function writeJsonFile(filePath, value) {
  await ensureDir(filePath);
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmpPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await fs.rename(tmpPath, filePath);
}

export async function readPipelineState(filePath) {
  const state = await readJsonFile(filePath, DEFAULT_STATE);
  return {
    ...DEFAULT_STATE,
    ...state,
  };
}

export async function writePipelineState(filePath, state) {
  await writeJsonFile(filePath, state);
}

export async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}
