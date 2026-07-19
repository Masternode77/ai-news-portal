import { createAdminMediaStorage } from '../../src/plugins/storage/admin-media-storage.mjs';

let configuredMediaStorage = null;
let mediaStorage = null;

export function getAdminMediaStorage() {
  if (configuredMediaStorage) return configuredMediaStorage;
  mediaStorage ||= createAdminMediaStorage();
  return mediaStorage;
}

export function configureAdminMediaStorageForTests(storage = null) {
  configuredMediaStorage = storage;
  mediaStorage = null;
}
