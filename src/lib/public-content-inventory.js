import archivedNews from '../data/archived-news.json' with { type: 'json' };
import latestNews from '../data/latest-news.json' with { type: 'json' };
import { readAdminPublicReadModel } from './admin-public-read-model.js';

function dedupeById(records) {
  const seen = new Set();
  return records.filter((record) => {
    const id = String(record?.id || '').trim();
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

export function mergePublicContentInventory(readModel, latest, archived) {
  const adminArticles = Array.isArray(readModel) ? readModel : (readModel.articles || []);
  const adminOwnedIds = new Set(Array.isArray(readModel) ? adminArticles.map((article) => article.id) : (readModel.ownedIds || []));
  const legacyArticles = [...latest, ...archived].filter((article) => !adminOwnedIds.has(article.id));
  return dedupeById([...adminArticles, ...legacyArticles]);
}

// The CMS read model is authoritative for matching IDs; legacy JSON remains the
// ingestion/pipeline surface until its migration is complete.
export const publicContentInventory = Object.freeze(mergePublicContentInventory(readAdminPublicReadModel(), latestNews, archivedNews));
