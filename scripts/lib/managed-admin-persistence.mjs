import crypto from 'node:crypto';
import sharp from 'sharp';
import { permanentDeleteConfirmation } from '../../src/plugins/storage/index.mjs';

const PROBE_PREFIX = 'cc-preview-persistence-';
const STATE_SCHEMA_VERSION = 1;

function requireText(value, message) {
  const normalized = String(value || '').trim();
  if (!normalized) throw new Error(message);
  return normalized;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function checksum(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function hasExactlyActions(rows, expected) {
  return rows.map((item) => item.action).sort().join(',') === [...expected].sort().join(',');
}

function combineFailure(current, next) {
  if (!current) return next;
  const failures = [
    ...(current instanceof AggregateError ? current.errors : [current]),
    ...(next instanceof AggregateError ? next.errors : [next]),
  ];
  return new AggregateError(failures, failures.map((error) => error.message).join('; '));
}

export function redactManagedError(error, secrets = []) {
  let message = String(error?.message || 'managed persistence verification failed');
  for (const secret of secrets.map(String).filter(Boolean)) message = message.replaceAll(secret, '[redacted]');
  return message.replace(/\b(postgres(?:ql)?|https?):\/\/[^\s@/]+:[^\s@]+@/gi, '$1://[redacted]@');
}

export function assertManagedPreviewConfig({
  target,
  scope,
  vercelEnv,
  databaseUrl,
  blobToken,
  mediaProvider,
} = {}) {
  if (target !== 'preview' || scope !== 'preview') {
    throw new Error('managed persistence verification requires target=preview and ADMIN_PERSISTENCE_SCOPE=preview');
  }
  if (vercelEnv !== 'preview') {
    throw new Error('managed persistence verification requires VERCEL_ENV=preview');
  }
  requireText(databaseUrl, 'DATABASE_URL is required for managed persistence verification');
  requireText(blobToken, 'BLOB_READ_WRITE_TOKEN is required for managed persistence verification');
  if (mediaProvider !== 'vercel-blob') {
    throw new Error('ADMIN_MEDIA_PROVIDER=vercel-blob is required for managed persistence verification');
  }
  return { target: 'preview', credentialsPresent: { database: true, blob: true } };
}

export function assertManagedProbeState(state) {
  assert(state && typeof state === 'object' && !Array.isArray(state), 'managed persistence probe state is invalid');
  assert(state.schemaVersion === STATE_SCHEMA_VERSION, 'managed persistence probe state schema is unsupported');
  assert(state.target === 'preview', 'managed persistence probe state is not scoped to preview');
  const articleId = requireText(state.articleId, 'managed persistence probe article id is missing');
  assert(articleId.startsWith(PROBE_PREFIX), 'managed persistence probe cannot target a non-probe article');
  assert(state.expectedVersion === 2, 'managed persistence probe version is invalid');
  const objectKey = requireText(state.objectKey, 'managed persistence probe media key is missing');
  assert(objectKey.startsWith(`admin-media/${articleId}/`), 'managed persistence probe cannot target unrelated media');
  assert(/^[a-f0-9]{64}$/.test(String(state.mediaChecksum || '')), 'managed persistence probe media checksum is invalid');
  requireText(state.runId, 'managed persistence probe run id is missing');
  return state;
}

async function probeImage() {
  return sharp({
    create: { width: 24, height: 16, channels: 3, background: '#2b8f8b' },
  }).png().toBuffer();
}

async function closeStorage(storage) {
  if (typeof storage?.close === 'function') await storage.close();
}

async function removeProbeArticle(storage, articleId, actor) {
  const current = await storage.getArticle(articleId, { includeDeleted: true });
  if (!current) return;
  const deleted = current.deletedAt
    ? current
    : await storage.softDeleteArticle(articleId, { expectedVersion: current.version, actor });
  await storage.permanentlyDeleteArticle(articleId, {
    expectedVersion: deleted.version,
    actor,
    confirmation: permanentDeleteConfirmation(articleId),
  });
}

export async function writeManagedAdminProbe({
  migrate,
  createStorage,
  createMediaStorage,
  runId = crypto.randomUUID(),
  deploymentId = '',
  now = () => new Date(),
  imageFactory = probeImage,
  persistState = async () => {},
} = {}) {
  assert(typeof migrate === 'function', 'migration runner is required');
  assert(typeof createStorage === 'function', 'admin storage factory is required');
  assert(typeof createMediaStorage === 'function', 'admin media factory is required');

  const articleId = `${PROBE_PREFIX}${now().getTime()}-${crypto.randomUUID().slice(0, 8)}`;
  const title = `Preview persistence probe ${articleId}`;
  const actor = { type: 'system', id: 'managed-persistence-verifier', role: 'admin' };
  const migrations = await migrate();
  const storage = createStorage();
  const mediaStorage = createMediaStorage();
  let savedMedia;
  let state;
  let persisted = false;
  let failure;

  try {
    await storage.createArticle({
      id: articleId,
      title,
      summary: 'Ephemeral preview-only persistence verification record.',
      category: 'Compute Infrastructure',
      source: 'Compute Current QA',
      public_status: 'draft',
      draft: true,
    }, { actor, action: 'probe-create', metadata: { scope: 'preview' } });
    const updated = await storage.updateArticle(articleId, {
      summary: 'Updated before reconnect to prove durable writes.',
    }, { expectedVersion: 1, actor, action: 'probe-update', metadata: { scope: 'preview' } });
    assert(updated.version === 2, 'managed persistence probe update did not reach version 2');

    const input = await imageFactory();
    savedMedia = await mediaStorage.saveImage({ articleId, buffer: input, contentType: 'image/png' });
    const persistedMedia = await mediaStorage.read(savedMedia.objectKey);
    assert(checksum(persistedMedia) === savedMedia.checksum, 'managed persistence probe Blob round trip failed');

    state = {
      schemaVersion: STATE_SCHEMA_VERSION,
      target: 'preview',
      articleId,
      title,
      expectedVersion: 2,
      objectKey: savedMedia.objectKey,
      mediaChecksum: savedMedia.checksum,
      runId,
      deploymentId: String(deploymentId || ''),
      createdAt: now().toISOString(),
      migrations: {
        applied: [...(migrations?.applied || [])],
        skipped: [...(migrations?.skipped || [])],
      },
    };
    await persistState(state);
    persisted = true;
  } catch (error) {
    failure = error;
  } finally {
    if (!persisted) {
      if (savedMedia) {
        try {
          await mediaStorage.remove(savedMedia);
        } catch (error) {
          failure = combineFailure(failure, error);
        }
      }
      try {
        await removeProbeArticle(storage, articleId, actor);
      } catch (error) {
        failure = combineFailure(failure, error);
      }
    }
    try {
      await closeStorage(storage);
    } catch (error) {
      failure = combineFailure(failure, error);
    }
  }
  if (failure) throw failure;
  return state;
}

export async function verifyManagedAdminProbe({
  state,
  createStorage,
  createMediaStorage,
  runId = crypto.randomUUID(),
  deploymentId = '',
  now = () => new Date(),
} = {}) {
  assertManagedProbeState(state);
  assert(typeof createStorage === 'function', 'admin storage factory is required');
  assert(typeof createMediaStorage === 'function', 'admin media factory is required');

  const storage = createStorage();
  const mediaStorage = createMediaStorage();
  const actor = { type: 'system', id: 'managed-persistence-verifier', role: 'admin' };
  let failure;
  let receipt;

  try {
    const article = await storage.getArticle(state.articleId, { includeDeleted: true });
    assert(article?.title === state.title, 'managed persistence probe article did not survive reconnect');
    assert(article.version === state.expectedVersion, 'managed persistence probe article version changed unexpectedly');

    const revisions = await storage.listRevisions(state.articleId);
    const audit = await storage.listAuditEntries({ articleId: state.articleId });
    const outbox = await storage.listPublicationOutbox({ articleId: state.articleId, pendingOnly: false, limit: 20 });
    assert(hasExactlyActions(revisions, ['probe-create', 'probe-update']), 'managed persistence revisions did not survive reconnect');
    assert(hasExactlyActions(audit, ['probe-create', 'probe-update']), 'managed persistence audit did not survive reconnect');
    assert(hasExactlyActions(outbox, ['probe-create', 'probe-update']), 'managed persistence outbox did not survive reconnect');

    const persistedMedia = await mediaStorage.read(state.objectKey);
    assert(checksum(persistedMedia) === state.mediaChecksum, 'managed persistence Blob did not survive reconnect');

    const deleted = await storage.softDeleteArticle(state.articleId, { expectedVersion: 2, actor });
    const restored = await storage.restoreArticle(state.articleId, { expectedVersion: deleted.version, actor });
    const deletedAgain = await storage.softDeleteArticle(state.articleId, { expectedVersion: restored.version, actor });
    await storage.permanentlyDeleteArticle(state.articleId, {
      expectedVersion: deletedAgain.version,
      actor,
      confirmation: permanentDeleteConfirmation(state.articleId),
    });
    assert(await storage.getArticle(state.articleId, { includeDeleted: true }) === null, 'managed persistence probe cleanup failed');

    const finalAudit = await storage.listAuditEntries({ articleId: state.articleId });
    const finalOutbox = await storage.listPublicationOutbox({ articleId: state.articleId, pendingOnly: false, limit: 20 });
    const lifecycleActions = ['probe-create', 'probe-update', 'soft-delete', 'restore', 'soft-delete', 'permanent-delete'];
    assert(hasExactlyActions(finalAudit, lifecycleActions), 'managed persistence cleanup audit is missing');
    assert(hasExactlyActions(finalOutbox, lifecycleActions), 'managed persistence cleanup outbox event is missing');

    receipt = {
      schemaVersion: STATE_SCHEMA_VERSION,
      target: 'preview',
      verifiedAt: now().toISOString(),
      processRestarted: state.runId !== runId,
      deploymentChanged: Boolean(state.deploymentId && deploymentId && state.deploymentId !== deploymentId),
      checks: {
        article: true,
        revisions: revisions.length === 2,
        audit: finalAudit.length === 6,
        outbox: finalOutbox.length === 6,
        privateBlob: true,
        softDeleteRestore: true,
        cleanup: true,
      },
      migrations: state.migrations,
    };
  } catch (error) {
    failure = error;
  } finally {
    try {
      await mediaStorage.remove({ objectKey: state.objectKey });
    } catch (error) {
      failure = combineFailure(failure, error);
    }
    try {
      await removeProbeArticle(storage, state.articleId, actor);
    } catch (error) {
      failure = combineFailure(failure, error);
    }
    try {
      await closeStorage(storage);
    } catch (error) {
      failure = combineFailure(failure, error);
    }
  }

  if (failure) throw failure;
  return receipt;
}
