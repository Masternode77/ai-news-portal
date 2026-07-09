import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_MARKERS = ['package.json', 'config'];

export function findProjectRoot(startPath = '') {
  let current = path.resolve(startPath || process.cwd());
  while (true) {
    if (ROOT_MARKERS.every((marker) => fs.existsSync(path.join(current, marker)))) return current;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

export function projectRoot(importMetaUrl = import.meta.url, options = {}) {
  const modulePath = fileURLToPath(importMetaUrl);
  const moduleRoot = findProjectRoot(path.dirname(modulePath));
  if (moduleRoot) return moduleRoot;
  const cwdRoot = findProjectRoot(options.cwd || process.cwd());
  if (cwdRoot) return cwdRoot;
  return path.resolve(path.dirname(modulePath), '../..');
}

export function projectPath(importMetaUrl = import.meta.url, ...segments) {
  return path.join(projectRoot(importMetaUrl), ...segments);
}

export function projectConfigPath(importMetaUrl = import.meta.url, ...segments) {
  return projectPath(importMetaUrl, 'config', ...segments);
}
