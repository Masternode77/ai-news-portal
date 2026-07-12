import fs from 'node:fs';
import path from 'node:path';
import { createAdminCmsService } from '../../src/admin/admin-cms-service.mjs';
import { createAdminStorage } from '../../src/plugins/storage/index.mjs';
import { createAdminMediaStorage } from '../../src/plugins/storage/admin-media-storage.mjs';

let configuredStorage = null;
let storagePromise = null;
let configuredMediaStorage = null;
let mediaStorage = null;

function readJson(name, fallback = []) {
  try {
    return JSON.parse(fs.readFileSync(path.resolve('src/data', name), 'utf8'));
  } catch {
    return fallback;
  }
}

async function seedLocalStorage(storage) {
  if (process.env.NODE_ENV === 'production' || process.env.ADMIN_SEED_JSON === '0') return;
  if ((await storage.listArticles({ includeDeleted: true })).length) return;
  const rows = [...readJson('latest-news.json'), ...readJson('archived-news.json')];
  const seen = new Set();
  await storage.transaction(async (transaction) => {
    for (const row of rows) {
      if (!row?.id || seen.has(row.id)) continue;
      seen.add(row.id);
      await transaction.createArticle(row, {
        action: 'json-import',
        actor: { type: 'system', id: 'legacy-json-import' },
        metadata: { source: 'src/data' },
      });
    }
  });
}

export async function getAdminStorage() {
  if (configuredStorage) return configuredStorage;
  if (!storagePromise) {
    storagePromise = (async () => {
      const storage = createAdminStorage();
      await seedLocalStorage(storage);
      return storage;
    })();
  }
  return storagePromise;
}

export async function getAdminCmsService() {
  return createAdminCmsService({ storage: await getAdminStorage() });
}

export function getAdminMediaStorage() {
  if (configuredMediaStorage) return configuredMediaStorage;
  mediaStorage ||= createAdminMediaStorage();
  return mediaStorage;
}

export function configureAdminStorageForTests(storage = null) {
  configuredStorage = storage;
  storagePromise = null;
}

export function configureAdminMediaStorageForTests(storage = null) {
  configuredMediaStorage = storage;
  mediaStorage = null;
}
