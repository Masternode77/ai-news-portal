import fs from 'node:fs/promises';
import path from 'node:path';

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

export function imagePromptForItem(item) {
  return (
    item.imagePrompt ||
    `Editorial enterprise technology illustration about ${item.title}. Context: ${item.articleText || item.summary || item.snippet || item.title}. No logos. No text. 16:9.`
  );
}

export function extensionForFormat(format = 'png') {
  const normalized = String(format).toLowerCase();
  if (normalized === 'jpeg' || normalized === 'jpg') return 'jpg';
  if (normalized === 'webp') return 'webp';
  return 'png';
}

export function extensionForMime(mime = 'image/png') {
  const normalized = String(mime).toLowerCase();
  if (normalized.includes('jpeg') || normalized.includes('jpg')) return 'jpg';
  if (normalized.includes('webp')) return 'webp';
  return 'png';
}

export async function writeGeneratedImage(outDir, item, bytes, ext = 'png') {
  const filename = `${item.id}.${ext}`;
  const outPath = path.join(outDir, filename);

  await fs.writeFile(outPath, bytes);
  return `/generated/${filename}`;
}
