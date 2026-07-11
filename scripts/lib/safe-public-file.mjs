import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

function isInside(root, candidate) {
  const relative = path.relative(root, candidate);
  return Boolean(relative && !relative.startsWith('..') && !path.isAbsolute(relative));
}

export function publicFilePath(publicDir, publicPath) {
  const root = path.resolve(publicDir);
  const candidate = path.resolve(root, String(publicPath || '').replace(/^\/+/, ''));
  if (!isInside(root, candidate)) throw new Error('Public output must stay inside public');
  return candidate;
}

export async function ensureSafePublicDirectory(publicDir, directoryPath) {
  const publicRoot = path.resolve(publicDir);
  const requestedDirectory = path.resolve(directoryPath);
  if (requestedDirectory !== publicRoot && !isInside(publicRoot, requestedDirectory)) {
    throw new Error('Public output directory must stay inside public');
  }

  await fs.mkdir(publicRoot, { recursive: true });
  const realPublicRoot = await fs.realpath(publicRoot);
  const relativeDirectory = path.relative(publicRoot, requestedDirectory);
  let current = realPublicRoot;

  for (const segment of relativeDirectory.split(path.sep).filter(Boolean)) {
    const next = path.join(current, segment);
    let stats;
    try {
      stats = await fs.lstat(next);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
      await fs.mkdir(next).catch((mkdirError) => {
        if (mkdirError?.code !== 'EEXIST') throw mkdirError;
      });
      stats = await fs.lstat(next);
    }
    if (stats.isSymbolicLink() || !stats.isDirectory()) {
      throw new Error('Public output directory must not contain symbolic links');
    }
    current = await fs.realpath(next);
    if (!isInside(realPublicRoot, current)) throw new Error('Public output directory escaped public');
  }

  return current;
}

export async function ensureSafePublicOutputTarget(publicDir, filePath) {
  const publicRoot = path.resolve(publicDir);
  const candidate = path.resolve(filePath);
  await fs.mkdir(publicRoot, { recursive: true });
  const realPublicRoot = await fs.realpath(publicRoot);
  let relative = path.relative(publicRoot, candidate);
  if (!isInside(publicRoot, candidate)) {
    if (!isInside(realPublicRoot, candidate)) throw new Error('Public output must stay inside public');
    relative = path.relative(realPublicRoot, candidate);
  }
  const logicalCandidate = path.join(publicRoot, relative);

  const safeParent = await ensureSafePublicDirectory(publicRoot, path.dirname(logicalCandidate));
  const safeTarget = path.join(safeParent, path.basename(logicalCandidate));
  try {
    const stats = await fs.lstat(safeTarget);
    if (stats.isSymbolicLink() || !stats.isFile()) {
      throw new Error('Public output target must be a regular file');
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  return safeTarget;
}

export async function writeSafePublicFile(publicDir, filePath, bytes) {
  const target = await ensureSafePublicOutputTarget(publicDir, filePath);
  const tempPath = path.join(
    path.dirname(target),
    `.${path.basename(target)}.${process.pid}.${randomUUID()}.tmp`,
  );
  try {
    await fs.writeFile(tempPath, bytes, { flag: 'wx' });
    await fs.rename(tempPath, target);
  } finally {
    await fs.rm(tempPath, { force: true }).catch(() => {});
  }
  return target;
}
