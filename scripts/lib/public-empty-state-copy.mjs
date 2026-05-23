import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sanitizePublicCopy } from './internal-language-guard.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const COPY_PATH = path.join(ROOT, 'config/editorial/public-empty-states.json');

export function publicEmptyStateCopy() {
  return JSON.parse(fs.readFileSync(COPY_PATH, 'utf8'));
}

export function publicEmptyStateText(key = 'no_latest_items') {
  const copy = publicEmptyStateCopy();
  return sanitizePublicCopy(copy[key] || copy.no_latest_items || 'No new stories yet.');
}
