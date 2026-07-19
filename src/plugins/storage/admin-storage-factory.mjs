import path from 'node:path';
import { AdminStorageError } from './admin-storage-contract.mjs';
import { LocalAdminStorage } from './local-admin-storage.mjs';
import { PostgresAdminStorage } from './postgres-admin-storage.mjs';

export function createAdminStorage(options = {}) {
  const provider = options.provider ?? (process.env.DATABASE_URL || process.env.NODE_ENV === 'production' ? 'postgres' : 'local');
  if (provider === 'local') {
    if ((process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV) && options.allowProductionLocal !== true) {
      throw new AdminStorageError('local admin storage is disabled in production', 'production_storage_required');
    }
    return new LocalAdminStorage({
      ...options,
      filePath: options.filePath ?? process.env.ADMIN_STORAGE_FILE ?? path.resolve('.cache/admin-cms.json'),
    });
  }
  if (provider === 'postgres') return new PostgresAdminStorage(options);
  throw new AdminStorageError(`unknown admin storage provider ${String(provider)}`, 'unknown_storage_provider');
}
