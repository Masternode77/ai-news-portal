import fs from 'node:fs/promises';
import path from 'node:path';

export const GENERATED_OUT_DIR = path.join(process.cwd(), 'public/generated');

export function buildImagePrompt(item) {
  return (
    item.imagePrompt ||
    `Editorial enterprise technology illustration about ${item.title}. Context: ${item.articleText || item.summary || item.snippet || item.title}. No logos. No text. 16:9.`
  );
}

export async function fetchWithTimeout(url, options = {}, timeoutMs = 20000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

export async function ensureGeneratedOutDir() {
  await fs.mkdir(GENERATED_OUT_DIR, { recursive: true });
}

export function extensionFromMime(mime = 'image/png') {
  if (mime.includes('jpeg') || mime.includes('jpg')) return 'jpg';
  if (mime.includes('webp')) return 'webp';
  if (mime.includes('svg')) return 'svg';
  return 'png';
}

export async function writeImageBytes(item, bytes, mime = 'image/png') {
  await ensureGeneratedOutDir();
  const ext = extensionFromMime(mime);
  const filename = `${item.id}.${ext}`;
  const outPath = path.join(GENERATED_OUT_DIR, filename);
  await fs.writeFile(outPath, bytes);
  return `/generated/${filename}`;
}

export async function writeBase64Image(item, data, mime = 'image/png') {
  return writeImageBytes(item, Buffer.from(data, 'base64'), mime);
}

export async function writeFetchedImage(item, url, headers = {}) {
  const response = await fetchWithTimeout(url, { headers }, 20000);
  if (!response.ok) {
    throw new Error(`Generated image fetch failed: ${response.status}`);
  }

  const mime = response.headers.get('content-type') || 'image/png';
  const bytes = Buffer.from(await response.arrayBuffer());
  return writeImageBytes(item, bytes, mime);
}
