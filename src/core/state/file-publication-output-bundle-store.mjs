import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const SCHEMA_VERSION = 1;

export class FilePublicationOutputBundleError extends Error {
  constructor(message, code = 'file_publication_output_bundle_error') {
    super(message);
    this.name = 'FilePublicationOutputBundleError';
    this.code = code;
  }
}

function safeRunId(runId) {
  if (typeof runId !== 'string' || !/^[a-zA-Z0-9._-]+$/.test(runId)) {
    throw new FilePublicationOutputBundleError('publication output bundle run id is invalid', 'invalid_output_bundle_run_id');
  }
  return runId;
}

function hash(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function normalizeRelativePath(projectRoot, filePath) {
  const absolutePath = path.resolve(projectRoot, filePath);
  const relativePath = path.relative(projectRoot, absolutePath);
  if (!relativePath || relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    throw new FilePublicationOutputBundleError('publication output path escapes the project root', 'invalid_output_bundle_path');
  }
  return relativePath.split(path.sep).join('/');
}

function validateManifest(manifest) {
  if (!manifest
    || typeof manifest !== 'object'
    || Array.isArray(manifest)
    || manifest.schemaVersion !== SCHEMA_VERSION
    || !safeRunId(manifest.runId)
    || !Array.isArray(manifest.files)
    || manifest.files.length < 1) {
    throw new FilePublicationOutputBundleError('publication output manifest is invalid', 'invalid_output_manifest');
  }
  const seen = new Set();
  for (const entry of manifest.files) {
    if (!entry
      || typeof entry !== 'object'
      || Array.isArray(entry)
      || typeof entry.path !== 'string'
      || !entry.path
      || entry.path.startsWith('/')
      || entry.path.split('/').includes('..')
      || !/^[a-f0-9]{64}$/.test(entry.sha256)
      || !Number.isSafeInteger(entry.size)
      || entry.size < 0
      || seen.has(entry.path)) {
      throw new FilePublicationOutputBundleError('publication output manifest entry is invalid', 'invalid_output_manifest');
    }
    seen.add(entry.path);
  }
  return manifest;
}

async function atomicWrite(filePath, bytes) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  try {
    await fs.writeFile(temporaryPath, bytes);
    await fs.rename(temporaryPath, filePath);
  } catch {
    await fs.rm(temporaryPath, { force: true }).catch(() => {});
    throw new FilePublicationOutputBundleError('publication output could not be restored', 'output_bundle_restore_failed');
  }
}

export class FilePublicationOutputBundleStore {
  constructor(bundleRoot, { projectRoot = process.cwd() } = {}) {
    if (typeof bundleRoot !== 'string' || !bundleRoot.trim()) {
      throw new FilePublicationOutputBundleError('publication output bundle root is required', 'invalid_output_bundle_root');
    }
    this.bundleRoot = path.resolve(bundleRoot);
    this.projectRoot = path.resolve(projectRoot);
  }

  async capture(runId, filePaths) {
    const id = safeRunId(runId);
    const relativePaths = [...new Set((filePaths || []).map((filePath) => (
      normalizeRelativePath(this.projectRoot, filePath)
    )))].sort();
    if (!relativePaths.length) {
      throw new FilePublicationOutputBundleError('publication output bundle requires files', 'empty_output_bundle');
    }
    const runRoot = path.join(this.bundleRoot, id);
    await fs.rm(runRoot, { recursive: true, force: true });
    const files = [];
    for (const relativePath of relativePaths) {
      let bytes;
      try {
        bytes = await fs.readFile(path.join(this.projectRoot, relativePath));
      } catch {
        throw new FilePublicationOutputBundleError(`publication output is missing: ${relativePath}`, 'output_bundle_source_missing');
      }
      await atomicWrite(path.join(runRoot, 'files', relativePath), bytes);
      files.push({ path: relativePath, sha256: hash(bytes), size: bytes.length });
    }
    const manifest = validateManifest({ schemaVersion: SCHEMA_VERSION, runId: id, files });
    await atomicWrite(
      path.join(runRoot, 'manifest.json'),
      Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`),
    );
    return structuredClone(manifest);
  }

  async verifyAndRestore(rawManifest) {
    const manifest = validateManifest(structuredClone(rawManifest));
    const runRoot = path.join(this.bundleRoot, manifest.runId);
    let storedManifest;
    try {
      storedManifest = validateManifest(JSON.parse(await fs.readFile(path.join(runRoot, 'manifest.json'), 'utf8')));
    } catch (error) {
      if (error instanceof FilePublicationOutputBundleError) throw error;
      throw new FilePublicationOutputBundleError('publication output bundle manifest is missing', 'output_bundle_manifest_missing');
    }
    if (JSON.stringify(storedManifest) !== JSON.stringify(manifest)) {
      throw new FilePublicationOutputBundleError('publication output receipt does not match its bundle', 'output_bundle_manifest_mismatch');
    }
    const restored = [];
    for (const entry of manifest.files) {
      const backupPath = path.join(runRoot, 'files', entry.path);
      const backup = await fs.readFile(backupPath).catch(() => null);
      if (!backup || backup.length !== entry.size || hash(backup) !== entry.sha256) {
        throw new FilePublicationOutputBundleError(`publication output backup is invalid: ${entry.path}`, 'output_bundle_backup_invalid');
      }
      const livePath = path.join(this.projectRoot, entry.path);
      const live = await fs.readFile(livePath).catch(() => null);
      if (!live || live.length !== entry.size || hash(live) !== entry.sha256) {
        await atomicWrite(livePath, backup);
        restored.push(entry.path);
      }
    }
    return { ok: true, restored };
  }
}
