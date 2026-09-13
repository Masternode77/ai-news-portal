import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { registerCodexImage, generateCodexImageSet, withCodexImageLock, imageFingerprint } from './lib/codex-image-provider.mjs';
import { metadataPatchFromImageSet } from './lib/image2-provider.mjs';

// Re-read after image processing: the initial collection is not a write snapshot.
export async function applyCodexImageMetadata(file, id, expectedFingerprint, patch) {
  const currentText = await fs.readFile(file, 'utf8');
  const items = JSON.parse(currentText);
  const article = items.find(item => item.id === id);
  if (!article || imageFingerprint(article) !== expectedFingerprint) {
    throw Error('Article changed after image preparation; prepare and review artwork again before importing');
  }
  const next = items.map(item => item.id === id ? { ...item, ...patch } : item);
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporary, JSON.stringify(next, null, 2) + '\n');
    if (await fs.readFile(file, 'utf8') !== currentText) {
      throw Error('Article collection changed during import; retry registration against the current collection');
    }
    await fs.rename(temporary, file);
  } finally {
    await fs.rm(temporary, { force: true });
  }
}

export async function main(args = process.argv.slice(2)) {
  const value = flag => { const i = args.indexOf(flag); return i < 0 ? undefined : args[i + 1]; };
  const id = value('--id'), imageFile = value('--file');
  if (!id || !imageFile) throw Error('Usage: node scripts/import-codex-image.mjs --id <article-id> --file <Codex-image-path> [--fingerprint <queued-fingerprint>] [--model <verified-model>]');
  const expectedFingerprint = value('--fingerprint');
  if (args.includes('--generated-at') && !Number.isFinite(Date.parse(value('--generated-at') || ''))) throw Error('Expected the registered generation timestamp');
  if (args.includes('--fingerprint') && !/^[a-f0-9]{64}$/.test(expectedFingerprint || '')) throw Error('Expected a SHA-256 article fingerprint');
  return withCodexImageLock('config/codex-image-import', async () => {
    const collections = await Promise.all(['src/data/latest-news.json', 'src/data/archived-news.json', 'src/data/authored-columns.json'].map(async file => ({ file, items: JSON.parse(await fs.readFile(file, 'utf8')) })));
    const collection = collections.find(c => c.items.some(a => a.id === id));
    const article = collection?.items.find(a => a.id === id);
    if (!article) throw Error('Article not found');
    const fingerprint = imageFingerprint(article);
    if (expectedFingerprint && fingerprint !== expectedFingerprint) throw Error('Article changed after image preparation; prepare and review artwork again before importing');
    const stat = await fs.stat(imageFile);
    if (!stat.isFile() || stat.size > 25 * 1024 * 1024) throw Error('Expected a local image file up to 25 MB');
    const manifestPath = path.resolve('config/codex-image-manifest.json');
    await registerCodexImage(article, await fs.readFile(imageFile), { manifestPath, model: value('--model'), generatedAt: value('--generated-at') });
    const result = await generateCodexImageSet(article, { manifestPath, throwOnError: true });
    await applyCodexImageMetadata(collection.file, id, fingerprint, metadataPatchFromImageSet(result));
    console.log(JSON.stringify({ id, provider: result.provider, heroImage: result.heroImage, status: result.status }));
    return result;
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
