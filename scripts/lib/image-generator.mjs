import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { GEMINI_API_URL, GEMINI_IMAGE_MODEL, PIPELINE_OFFLINE } from './constants.mjs';

const OUT_DIR = path.join(process.cwd(), 'public/generated');

function colorFromId(id = 'abcdef1234567890') {
  const a = parseInt(id.slice(0, 2), 16) || 64;
  const b = parseInt(id.slice(2, 4), 16) || 96;
  const c = parseInt(id.slice(4, 6), 16) || 128;

  return {
    one: `rgb(${40 + (a % 120)} ${64 + (b % 120)} ${96 + (c % 100)})`,
    two: `rgb(${90 + (c % 120)} ${70 + (a % 100)} ${110 + (b % 100)})`,
    three: `rgb(${90 + (b % 80)} ${160 + (c % 70)} ${190 + (a % 40)})`,
  };
}

async function ensureOutDir() {
  await fs.mkdir(OUT_DIR, { recursive: true });
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function safeText(text = '', max = 72) {
  return (text || '').replace(/[<>&"']/g, ' ').trim().slice(0, max);
}

async function writePlaceholderSvg(item) {
  const palette = colorFromId(item.id);
  const filename = `${item.id}.svg`;
  const outPath = path.join(OUT_DIR, filename);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1344" height="768" viewBox="0 0 1344 768" fill="none">
  <defs>
    <linearGradient id="bg" x1="120" y1="70" x2="1180" y2="690" gradientUnits="userSpaceOnUse">
      <stop stop-color="${palette.one}"/>
      <stop offset="0.42" stop-color="#111829"/>
      <stop offset="1" stop-color="#090C12"/>
    </linearGradient>
    <filter id="noise">
      <feTurbulence type="fractalNoise" baseFrequency="0.84" numOctaves="2" stitchTiles="stitch"/>
      <feComponentTransfer><feFuncA type="table" tableValues="0 0 0.03 0.04"/></feComponentTransfer>
    </filter>
  </defs>
  <rect width="1344" height="768" rx="40" fill="url(#bg)"/>
  <circle cx="284" cy="172" r="232" fill="${palette.two}" fill-opacity="0.22"/>
  <circle cx="1080" cy="138" r="194" fill="${palette.three}" fill-opacity="0.15"/>
  <rect x="70" y="72" width="1204" height="624" rx="34" stroke="rgba(255,255,255,0.12)" fill="rgba(255,255,255,0.03)"/>
  <path d="M126 592C250 506 356 460 456 458C564 456 650 520 758 520C890 520 998 420 1206 244" stroke="#E8F0FF" stroke-opacity="0.45" stroke-width="4"/>
  <g stroke="rgba(255,255,255,0.08)">
    <path d="M108 604H1236"/>
    <path d="M108 556H1236"/>
    <path d="M108 508H1236"/>
    <path d="M210 112V658"/>
    <path d="M488 112V658"/>
    <path d="M766 112V658"/>
    <path d="M1044 112V658"/>
  </g>
  <text x="118" y="164" fill="#F6F8FF" font-family="Inter, Arial, sans-serif" font-size="20" font-weight="700" letter-spacing="0.12em">${safeText(item.category || 'AI / DATA CENTER SIGNAL')}</text>
  <text x="118" y="236" fill="#F6F8FF" font-family="Inter, Arial, sans-serif" font-size="54" font-weight="800">${safeText(item.title, 34)}</text>
  <text x="118" y="292" fill="#CBD8F5" font-family="Inter, Arial, sans-serif" font-size="26" font-weight="600">${safeText(item.source || 'Curated infrastructure briefing', 44)}</text>
  <text x="118" y="612" fill="#C1CDE6" font-family="Inter, Arial, sans-serif" font-size="20" font-weight="600">Fallback editorial artwork generated locally</text>
  <rect width="1344" height="768" rx="40" filter="url(#noise)"/>
</svg>`;

  await fs.writeFile(outPath, svg, 'utf8');
  return `/generated/${filename}`;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 20000) {
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

async function generateLocalPoster(item) {
  if (PIPELINE_OFFLINE) {
    return null;
  }

  const sourceImage = item.sourceImage || item.image || null;
  if (!sourceImage) {
    return null;
  }

  const response = await fetchWithTimeout(sourceImage, {
    headers: {
      'user-agent': 'Mozilla/5.0 (compatible; AINewsPortalBot/1.0)',
    },
  }, 20000);

  if (!response.ok) {
    throw new Error(`Source image fetch failed: ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const palette = colorFromId(item.id);
  const title = safeText(item.title, 56);
  const category = safeText(item.category || 'AI Infrastructure Brief', 32);
  const source = safeText(item.source || 'Curated source', 28);
  const summary = safeText(item.summary || item.snippet || '', 96);
  const filename = `${item.id}.jpg`;
  const outPath = path.join(OUT_DIR, filename);

  const overlaySvg = Buffer.from(`
    <svg width="1344" height="768" viewBox="0 0 1344 768" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="wash" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="${palette.one}" stop-opacity="0.18" />
          <stop offset="0.5" stop-color="#071019" stop-opacity="0.72" />
          <stop offset="1" stop-color="#05070c" stop-opacity="0.94" />
        </linearGradient>
      </defs>
      <rect width="1344" height="768" fill="url(#wash)" />
      <rect x="48" y="48" width="1248" height="672" rx="34" fill="none" stroke="rgba(255,255,255,0.14)" />
      <text x="92" y="132" fill="#d8e6ff" font-family="Arial, sans-serif" font-size="24" font-weight="700" letter-spacing="2">${category}</text>
      <text x="92" y="240" fill="#ffffff" font-family="Arial, sans-serif" font-size="62" font-weight="800">${title}</text>
      <text x="92" y="306" fill="#d7e4fb" font-family="Arial, sans-serif" font-size="28" font-weight="500">${source}</text>
      <text x="92" y="628" fill="#bbcae2" font-family="Arial, sans-serif" font-size="24" font-weight="500">${summary}</text>
    </svg>
  `);

  await sharp(Buffer.from(arrayBuffer))
    .resize(1344, 768, {
      fit: 'cover',
      position: 'attention',
    })
    .modulate({ brightness: 0.82, saturation: 1.08 })
    .blur(0.3)
    .composite([{ input: overlaySvg }])
    .jpeg({ quality: 88, mozjpeg: true })
    .toFile(outPath);

  return `/generated/${filename}`;
}

async function generateWithGemini(item, apiKey) {
  const response = await fetchWithTimeout(`${GEMINI_API_URL}/${GEMINI_IMAGE_MODEL}:generateContent`, {
    method: 'POST',
    headers: {
      'x-goog-api-key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            {
              text:
                item.imagePrompt ||
                `Editorial enterprise technology illustration about ${item.title}. Context: ${item.articleText || item.summary || item.snippet || item.title}. No logos. No text. 16:9.`,
            },
          ],
        },
      ],
      generationConfig: {
        imageConfig: {
          aspectRatio: '16:9',
        },
      },
    }),
  }, 45000);

  if (!response.ok) {
    throw new Error(`Gemini image request failed: ${response.status}`);
  }

  const payload = await response.json();
  const parts = payload?.candidates?.[0]?.content?.parts || [];
  const inlinePart = parts.find((part) => part.inlineData?.data);

  if (!inlinePart?.inlineData?.data) {
    throw new Error('No image bytes returned by Gemini');
  }

  const mime = inlinePart.inlineData.mimeType || 'image/png';
  const ext = mime.includes('jpeg') ? 'jpg' : 'png';
  const filename = `${item.id}.${ext}`;
  const outPath = path.join(OUT_DIR, filename);
  const bytes = Buffer.from(inlinePart.inlineData.data, 'base64');

  await fs.writeFile(outPath, bytes);
  return `/generated/${filename}`;
}

export async function needsImageRefresh(item) {
  if (item?.forceImageRefresh || item?.forceAiImage) return true;
  if (!item?.generatedImage) return true;
  if (/^https?:\/\//i.test(item.generatedImage)) return true;
  const localPath = path.join(process.cwd(), 'public', item.generatedImage.replace(/^\//, ''));
  return !(await fileExists(localPath));
}

export async function ensureArticleImage(item) {
  await ensureOutDir();

  if (!(await needsImageRefresh(item))) {
    return item.generatedImage;
  }

  if (item?.forcePlaceholderImage) {
    return writePlaceholderSvg(item);
  }

  const apiKey = process.env.GEMINI_API_KEY;
  const wantsAiImage = Boolean(item?.forceAiImage);

  if (apiKey && !PIPELINE_OFFLINE) {
    try {
      return await generateWithGemini(item, apiKey);
    } catch (error) {
      console.error(`[pipeline] image AI fallback for ${item.id}: ${error.message}`);
      if (wantsAiImage) {
        return writePlaceholderSvg(item);
      }
    }
  }

  try {
    const poster = await generateLocalPoster(item);
    if (poster) return poster;
  } catch (error) {
    console.error(`[pipeline] source poster fallback for ${item.id}: ${error.message}`);
  }

  return writePlaceholderSvg(item);
}
