import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { registerCodexImage, generateCodexImageSet, withCodexImageLock, imageFingerprint } from './lib/codex-image-provider.mjs';
import { metadataPatchFromImageSet } from './lib/image2-provider.mjs';
import { canonicalArticleImagePaths } from './lib/image-store.mjs';

async function rejectReusedArticleVariant(id, bytes, articles) {
  const candidates = new Map();
  for (const article of articles.filter(item => item.id !== id)) {
    for (const images of [article, canonicalArticleImagePaths(article, { extension: 'webp', legacyExtension: 'webp' })]) {
      for (const key of ['heroImage', 'thumbnailImage', 'ogImage', 'generatedImage', 'legacyImage']) {
        const image = images[key];
        if (typeof image === 'string' && /^\/generated\/[A-Za-z0-9/_-]+\.(webp|png|jpe?g)$/i.test(image)) candidates.set(image, article.id);
      }
    }
  }
  let publicRoot;
  try { publicRoot = await fs.realpath('public'); }
  catch (error) { if (error.code === 'ENOENT') return; throw error; }
  const inputHash = createHash('sha256').update(bytes).digest('hex');
  for (const [image, owner] of candidates) {
    try {
      const file = await fs.realpath(path.join(publicRoot, image.slice(1)));
      if (!file.startsWith(publicRoot + path.sep)) throw Error('Existing article image escapes the public directory');
      const stat = await fs.stat(file);
      if (!stat.isFile() || stat.size !== bytes.length) continue;
      if (createHash('sha256').update(await fs.readFile(file)).digest('hex') === inputHash) {
        throw Error(`Column artwork must be unique; this rendered image already belongs to article ${owner}. Generate a new image.`);
      }
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
}

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
    const bytes = await fs.readFile(imageFile);
    const uniqueToArticle = collection.file === 'src/data/authored-columns.json';
    if (uniqueToArticle) await rejectReusedArticleVariant(id, bytes, collections.flatMap(item => item.items));
    await registerCodexImage(article, bytes, { manifestPath, model: value('--model'), generatedAt: value('--generated-at'), uniqueToArticle });
    const result = await generateCodexImageSet(article, { manifestPath, throwOnError: true });
    await applyCodexImageMetadata(collection.file, id, fingerprint, metadataPatchFromImageSet(result));
    console.log(JSON.stringify({ id, provider: result.provider, heroImage: result.heroImage, status: result.status }));
    return result;
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
