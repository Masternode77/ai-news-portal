import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { createHash, randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { buildArticleImagePrompt, articleImageAltText } from './article-image-prompt.mjs';
import { writeArticleImageSetFromBytes, writeFallbackArticleImageSet } from './image-store.mjs';

export async function withCodexImageLock(file, action) {
  const lock = `${file instanceof URL ? fileURLToPath(file) : path.resolve(file)}.lock`;
  let handle;
  for (let attempt = 0; attempt < 100; attempt++) {
    try { handle = await fs.open(lock, 'wx'); break; }
    catch (error) { if (error.code !== 'EEXIST') throw error; await delay(50); }
  }
  if (!handle) throw new Error(`Codex image registration lock remains at ${lock}. Inspect its PID; wait if that process is running. If the recorded process has exited, remove that specific lock and retry. See docs/codex-image-workflow.md.`);
  try { await handle.writeFile(JSON.stringify({pid:process.pid,createdAt:new Date().toISOString()})); return await action(); }
  finally { await handle.close(); await fs.unlink(lock); }
}

const defaultManifest = new URL('../../config/codex-image-manifest.json', import.meta.url);
export const imageFingerprint = article => createHash('sha256').update(JSON.stringify([article.id, buildArticleImagePrompt(article)])).digest('hex');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
async function readManifest(file) {
  try { const manifest=JSON.parse(await fs.readFile(file,'utf8')); if(manifest.version!==1 || !manifest.images || Array.isArray(manifest.images))throw Error('Invalid Codex image manifest'); return manifest; }
  catch(error) { if(error.code==='ENOENT')return {version:1,images:{}}; throw error; }
}

// No credentials, network requests, or desktop-session impersonation: the caller
// registers a native Codex image file; CI consumes that verified local artifact.
export async function registerCodexImage(article, bytes, options = {}) {
  if(typeof article.id !== 'string' || !/^[A-Za-z0-9_-]+$/.test(article.id) || ['__proto__','constructor','prototype'].includes(article.id) || !article.title)throw Error('Article identity is required');
  if(bytes.length>25*1024*1024)throw Error('Codex image exceeds 25 MB');
  const info=await sharp(bytes,{limitInputPixels:40_000_000}).metadata();
  if(!['png','jpeg','webp'].includes(info.format) || (info.pages||1)!==1 || info.width<640 || info.height<360)throw Error('Expected a single PNG, JPEG or WebP image at least 640×360');
  const publicDir=options.publicDir || path.join(process.cwd(),'public');
  const manifestPath=options.manifestPath || defaultManifest;
  const normalized=await sharp(bytes,{limitInputPixels:40_000_000}).rotate().webp({quality:92}).toBuffer();
  const digest=hash(normalized), sourcePath=`/generated/codex-inputs/${digest}.webp`;
  const target=path.join(publicDir,sourcePath.slice(1));
  await fs.mkdir(path.dirname(target),{recursive:true});
  const sourceTemporary=`${target}.${randomUUID()}.tmp`;
  await fs.writeFile(sourceTemporary,normalized);await fs.rename(sourceTemporary,target);
  const generatedAt=options.generatedAt || new Date().toISOString();
  if(!Number.isFinite(Date.parse(generatedAt)))throw Error('Invalid image generation date');
  const entry={fingerprint:imageFingerprint(article),sha256:digest,sourcePath,generatedAt,provider:'codex',model:options.model || ''};
  await withCodexImageLock(manifestPath, async () => {
    const manifest=await readManifest(manifestPath);
    manifest.images[article.id]=entry;
    const file=manifestPath instanceof URL ? fileURLToPath(manifestPath) : path.resolve(manifestPath);
    const temporary=`${file}.${randomUUID()}.tmp`;
    try { await fs.writeFile(temporary,JSON.stringify(manifest,null,2)+'\n');await fs.rename(temporary,file); }
    finally { await fs.rm(temporary,{force:true}); }
  });
  return entry;
}

export async function generateCodexImageSet(article = {}, options = {}) {
  const publicDir=options.publicDir || process.env.IMAGE2_PUBLIC_DIR || path.join(process.cwd(),'public');
  const base={prompt:buildArticleImagePrompt(article),alt:articleImageAltText(article),generatedAt:options.now?.().toISOString() || new Date().toISOString()};
  let reason='No Codex artwork registered; using local artwork.';
  try {
    const manifest=await readManifest(options.manifestPath || defaultManifest);
    const entry=Object.hasOwn(manifest.images, article.id) ? manifest.images[article.id] : undefined;
    if(entry) {
      if(entry.fingerprint!==imageFingerprint(article))throw Error('Registered Codex artwork belongs to an earlier article revision.');
      if(!/^\/generated\/codex-inputs\/[a-f0-9]{64}\.webp$/.test(entry.sourcePath) || entry.provider!=='codex' || !Number.isFinite(Date.parse(entry.generatedAt)))throw Error('Invalid registered Codex artwork metadata.');
      const source=await fs.realpath(path.join(publicDir,entry.sourcePath.slice(1)));
      const root=await fs.realpath(publicDir);
      if(!source.startsWith(root+path.sep))throw Error('Registered artwork must remain inside the public directory.');
      const bytes=await fs.readFile(source);
      if(hash(bytes)!==entry.sha256)throw Error('Registered Codex artwork integrity check failed.');
      return await writeArticleImageSetFromBytes(article,bytes,{...base,provider:'codex',model:entry.model,generatedAt:entry.generatedAt,status:'generated',error:''},{publicDir});
    }
  } catch(error) { if(options.throwOnError)throw error; reason=error.code==='ENOENT'?'Registered Codex artwork file is missing.':error.message; }
  return writeFallbackArticleImageSet(article,{...base,provider:'local',model:'',status:'fallback',error:reason},{publicDir});
}
export function createCodexImageProvider() {
  return {name:'codex',generateWithMetadata:generateCodexImageSet,async generate(article){return (await generateCodexImageSet(article)).heroImage;}};
}
