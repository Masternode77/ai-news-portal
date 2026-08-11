import fs from 'node:fs';
import { sanitizePublicCopy } from './internal-language-guard.mjs';
import { resolveRepositoryFile } from './repository-file-resolver.mjs';

const COPY_PATH = resolveRepositoryFile('config/editorial/public-empty-states.json');

export function publicEmptyStateCopy() {
  return JSON.parse(fs.readFileSync(COPY_PATH, 'utf8'));
}

export function publicEmptyStateText(key = 'no_latest_items') {
  const copy = publicEmptyStateCopy();
  return sanitizePublicCopy(copy[key] || copy.no_latest_items || 'No new stories yet.');
}
