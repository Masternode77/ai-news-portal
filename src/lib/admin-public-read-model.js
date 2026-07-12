import fs from 'node:fs';
import path from 'node:path';

export const ADMIN_PUBLIC_READ_MODEL_PATH = path.resolve(
  process.env.ADMIN_PUBLIC_READ_MODEL_PATH || '.cache/admin-public-read-model.json',
);

export function readAdminPublicReadModel(filePath = ADMIN_PUBLIC_READ_MODEL_PATH) {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return {
      articles: Array.isArray(parsed?.articles) ? parsed.articles : [],
      ownedIds: Array.isArray(parsed?.ownedIds) ? parsed.ownedIds : [],
    };
  } catch (error) {
    if (error?.code === 'ENOENT') return { articles: [], ownedIds: [] };
    throw error;
  }
}
