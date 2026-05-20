import { readJsonFile, writeJsonFile } from './lib/state-store.mjs';
import { LATEST_NEWS_PATH, ARCHIVE_NEWS_PATH, SEARCH_INDEX_PATH } from './lib/constants.mjs';
import { AUTONOMOUS_VERSION } from './lib/autonomous-desk-utils.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function hasOldTemplate(article = {}) {
  const text = [
    article.deck,
    article.summary,
    article.snippet,
    article.expertLensShort,
    article.expertLensFull?.finalArticleBody,
  ].filter(Boolean).join('\n');
  return /(Commercially,|Operationally,|worth a local Compute Current read|lens for infrastructure readers|not just another AI headline|reported item can translate into|readers should test whether)/i.test(text);
}

function migrateArticle(article = {}) {
  if (article.generation_version === AUTONOMOUS_VERSION) return article;
  return {
    ...article,
    stale_generation: true,
    stale_generation_reason: hasOldTemplate(article)
      ? 'old_template_expanded_article'
      : 'pre_autonomous_editorial_desk',
    previous_generation_version: article.generation_version || article.public_generation_version || 'unknown',
  };
}

export async function migrateAutonomousEditorialDeskV1() {
  const [latest, archived] = await Promise.all([
    readJsonFile(LATEST_NEWS_PATH, []),
    readJsonFile(ARCHIVE_NEWS_PATH, []),
  ]);
  const latestOut = latest.map(migrateArticle);
  const archivedOut = archived.map(migrateArticle);
  await Promise.all([
    writeJsonFile(LATEST_NEWS_PATH, latestOut),
    writeJsonFile(ARCHIVE_NEWS_PATH, archivedOut),
    writeJsonFile(SEARCH_INDEX_PATH, [...latestOut, ...archivedOut]),
  ]);
  return {
    migrated_latest: latestOut.length,
    migrated_archived: archivedOut.length,
    stale_marked: [...latestOut, ...archivedOut].filter((article) => article.stale_generation).length,
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const result = await migrateAutonomousEditorialDeskV1();
  console.log(JSON.stringify(result, null, 2));
}
