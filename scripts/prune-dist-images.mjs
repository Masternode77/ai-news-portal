import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TEXT_EXTENSIONS = new Set(['.css', '.html', '.js', '.json', '.txt', '.xml']);

async function filesUnder(root) {
  const entries = await fs.readdir(root, { withFileTypes: true }).catch((error) => {
    if (error.code === 'ENOENT') return [];
    throw error;
  });
  const nested = await Promise.all(entries.map(async (entry) => {
    const filePath = path.join(root, entry.name);
    if (entry.isDirectory()) return filesUnder(filePath);
    return entry.isFile() ? [filePath] : [];
  }));
  return nested.flat();
}

async function removeEmptyDirectories(root) {
  const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => []);
  await Promise.all(entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => removeEmptyDirectories(path.join(root, entry.name))));
  const remaining = await fs.readdir(root).catch(() => []);
  if (!remaining.length) await fs.rmdir(root).catch(() => {});
}

export async function pruneUnreferencedDistImages({ distDir = path.resolve('dist'), dryRun = false } = {}) {
  const generatedDir = path.join(distDir, 'generated');
  const allFiles = await filesUnder(distDir);
  const textFiles = allFiles.filter((filePath) => (
    !filePath.startsWith(`${generatedDir}${path.sep}`)
    && TEXT_EXTENSIONS.has(path.extname(filePath).toLowerCase())
  ));
  const publicText = (await Promise.all(textFiles.map((filePath) => fs.readFile(filePath, 'utf8')))).join('\n');
  const generatedFiles = await filesUnder(generatedDir);
  const removed = [];
  const kept = [];

  for (const filePath of generatedFiles) {
    const publicPath = `/${path.relative(distDir, filePath).split(path.sep).join('/')}`;
    if (publicText.includes(publicPath) || publicText.includes(encodeURI(publicPath))) {
      kept.push(publicPath);
      continue;
    }
    removed.push(publicPath);
    if (!dryRun) await fs.unlink(filePath);
  }

  if (!dryRun) await removeEmptyDirectories(generatedDir);
  return { scanned: generatedFiles.length, kept, removed };
}

function parseArgs(argv = process.argv.slice(2)) {
  return { dryRun: argv.includes('--dry-run') };
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  const result = await pruneUnreferencedDistImages(parseArgs());
  console.log(`[prune:dist-images] scanned=${result.scanned} kept=${result.kept.length} removed=${result.removed.length}`);
}
