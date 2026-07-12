import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { runAdminStorageMigrations } from './migrate-admin-storage.mjs';
import {
  assertManagedPreviewConfig,
  redactManagedError,
  verifyManagedAdminProbe,
  writeManagedAdminProbe,
} from './lib/managed-admin-persistence.mjs';
import { createAdminMediaStorage, createPostgresAdminStorage } from '../src/plugins/storage/index.mjs';

function argumentsMap(argv) {
  return Object.fromEntries(argv.filter((value) => value.startsWith('--')).map((value) => {
    const [key, ...parts] = value.slice(2).split('=');
    return [key, parts.join('=') || true];
  }));
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await fs.rename(temporary, filePath);
}

export async function main(argv = process.argv.slice(2), environment = process.env) {
  const args = argumentsMap(argv);
  const phase = String(args.phase || '');
  if (!['write', 'verify', 'cycle'].includes(phase)) {
    throw new Error('--phase=write, --phase=verify, or --phase=cycle is required');
  }

  assertManagedPreviewConfig({
    target: args.target,
    scope: environment.ADMIN_PERSISTENCE_SCOPE,
    vercelEnv: environment.VERCEL_ENV,
    databaseUrl: environment.DATABASE_URL,
    blobToken: environment.BLOB_READ_WRITE_TOKEN,
    mediaProvider: environment.ADMIN_MEDIA_PROVIDER,
  });

  const statePath = path.resolve(String(args.state || 'artifacts/admin-managed-persistence/state.json'));
  const receiptPath = path.resolve(String(args.receipt || 'artifacts/admin-managed-persistence/receipt.json'));
  const runId = crypto.randomUUID();
  const deploymentId = String(args.deployment || environment.VERCEL_DEPLOYMENT_ID || '');
  const createStorage = () => createPostgresAdminStorage({ databaseUrl: environment.DATABASE_URL });
  const createMediaStorage = () => createAdminMediaStorage({
    provider: 'vercel-blob',
    token: environment.BLOB_READ_WRITE_TOKEN,
  });
  const write = () => writeManagedAdminProbe({
    migrate: () => runAdminStorageMigrations({ databaseUrl: environment.DATABASE_URL }),
    createStorage,
    createMediaStorage,
    runId,
    deploymentId,
    persistState: (state) => writeJson(statePath, state),
  });
  const verify = (state) => verifyManagedAdminProbe({
    state,
    createStorage,
    createMediaStorage,
    runId,
    deploymentId,
  });

  if (phase === 'write') {
    if (await pathExists(statePath)) throw new Error(`probe state already exists at ${statePath}; verify it before creating another probe`);
    await write();
    console.log(`[admin:verify-managed] preview probe written to ${statePath}`);
    return { phase, statePath };
  }

  if (phase === 'verify') {
    const state = JSON.parse(await fs.readFile(statePath, 'utf8'));
    const receipt = await verify(state);
    await writeJson(receiptPath, receipt);
    await fs.rm(statePath, { force: true });
    console.log(`[admin:verify-managed] preview persistence verified; receipt ${receiptPath}`);
    return { phase, receiptPath, receipt };
  }

  if (await pathExists(statePath)) throw new Error(`probe state already exists at ${statePath}; verify it before running a cycle`);
  const state = await write();
  const receipt = await verify(state);
  await writeJson(receiptPath, receipt);
  await fs.rm(statePath, { force: true });
  console.log(`[admin:verify-managed] preview reconnect cycle verified; receipt ${receiptPath}`);
  return { phase, receiptPath, receipt };
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((error) => {
    console.error(`[admin:verify-managed] ${redactManagedError(error, [
      process.env.DATABASE_URL,
      process.env.BLOB_READ_WRITE_TOKEN,
    ])}`);
    process.exitCode = 1;
  });
}
