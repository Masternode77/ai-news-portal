// Storage for The Current columns. Columns live in their own data file so the
// wire pipeline's merge/normalize/truncate machinery can never rewrite or
// template-replace an authored essay. Only the column engine and the admin
// editor write here.
import { AUTHORED_COLUMNS_PATH } from './constants.mjs';
import { readJsonFile, writeJsonFile } from './state-store.mjs';

const MAX_STORED_COLUMNS = 400;

function publishedMs(column = {}) {
  const stamp = new Date(column.publishedAt || column.analysisPublishedAt || 0).getTime();
  return Number.isFinite(stamp) ? stamp : 0;
}

export async function readAuthoredColumns(filePath = AUTHORED_COLUMNS_PATH) {
  const columns = await readJsonFile(filePath, []);
  return Array.isArray(columns) ? columns : [];
}

export async function writeAuthoredColumns(columns = [], filePath = AUTHORED_COLUMNS_PATH) {
  const sorted = [...columns].sort((a, b) => publishedMs(b) - publishedMs(a)).slice(0, MAX_STORED_COLUMNS);
  await writeJsonFile(filePath, sorted);
  return sorted;
}

// Appends a column, replacing any prior record with the same id or slug.
// story_key dedupe is the engine's job (it must skip generation entirely);
// here it is only a final belt-and-braces guard against double writes.
export async function appendAuthoredColumn(column, filePath = AUTHORED_COLUMNS_PATH) {
  if (!column?.id || !column?.slug) {
    throw new Error('authored column requires id and slug');
  }
  const existing = await readAuthoredColumns(filePath);
  const filtered = existing.filter((item) => (
    item.id !== column.id
    && item.slug !== column.slug
    && !(column.story_key && item.story_key === column.story_key)
  ));
  return writeAuthoredColumns([column, ...filtered], filePath);
}
