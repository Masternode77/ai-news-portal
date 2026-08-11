import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function moduleFilePath(moduleUrl) {
  try {
    return path.resolve(fileURLToPath(moduleUrl));
  } catch {
    throw new Error(`Unable to resolve repository root from module URL: ${moduleUrl}`);
  }
}

export function findRepositoryRoot(moduleUrl = import.meta.url) {
  let current = path.dirname(moduleFilePath(moduleUrl));

  while (true) {
    const packagePath = path.join(current, 'package.json');
    if (fs.existsSync(packagePath) && fs.statSync(packagePath).isFile()) return current;

    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }

  throw new Error(`Unable to locate repository package.json from module URL: ${moduleUrl}`);
}

export function resolveRepositoryFile(relativePath, { moduleUrl = import.meta.url } = {}) {
  if (!relativePath || path.isAbsolute(relativePath)) {
    throw new Error(`Repository file path must be a non-empty relative path: ${relativePath}`);
  }

  const repositoryRoot = findRepositoryRoot(moduleUrl);
  const resolvedPath = path.resolve(repositoryRoot, relativePath);
  const rootRelativePath = path.relative(repositoryRoot, resolvedPath);
  if (rootRelativePath === '..' || rootRelativePath.startsWith(`..${path.sep}`) || path.isAbsolute(rootRelativePath)) {
    throw new Error(`Repository file path must stay within the repository root: ${relativePath}`);
  }
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Required canonical repository policy file is missing: ${relativePath}`);
  }

  return resolvedPath;
}
