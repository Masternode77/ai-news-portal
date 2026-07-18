import fs from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_STATE = {
  publishedIds: [],
  dayPlans: {},
  runHistory: [],
  publicationReceipts: {},
  lastRunAt: null,
};

async function ensureDir(filePath) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

export async function readJsonFile(filePath, defaultValue) {
  let raw;
  try {
    raw = await fs.readFile(filePath, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return defaultValue;
    throw error;
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Unable to parse JSON state file: ${filePath}`, { cause: error });
  }

  if (Array.isArray(defaultValue) && !Array.isArray(parsed)) {
    throw new Error(`JSON state file must contain an array: ${filePath}`);
  }
  if (
    defaultValue
    && typeof defaultValue === 'object'
    && !Array.isArray(defaultValue)
    && (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
  ) {
    throw new Error(`JSON state file must contain an object: ${filePath}`);
  }
  return parsed;
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
