import fs from 'node:fs/promises';
import path from 'node:path';
import { GEMINI_IMAGE_MODEL } from './constants.mjs';

const OUT_DIR = path.join(process.cwd(), 'public/generated');

function colorFromId(id) {
  const a = parseInt(id.slice(0, 2), 16);
  const b = parseInt(id.slice(2, 4), 16);
  const c = parseInt(id.slice(4, 6), 16);
  return {
    one: `rgb(${20 + (a % 120)}, ${40 + (b % 120)}, ${70 + (c % 120)})`,
    two: `rgb(${90 + (c % 120)}, ${40 + (a % 120)}, ${120 + (b % 100)})`,
  };
}

async function ensureOutDir() {
  await fs.mkdir(OUT_DIR, { recursive: true });
}

async function writePlaceholderSvg(item) {
  const palette = colorFromId(item.id);
  const filename = `${item.id}.svg`;
  const outPath = path.join(OUT_DIR, filename);
  const safeTitle = (item.title || 'AI/DC Update').replace(/[<>&"']/g, ' ');

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${palette.one}"/>
      <stop offset="100%" stop-color="${palette.two}"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#g)"/>
  <rect x="38" y="40" width="1124" height="550" rx="24" fill="rgba(12,16,22,0.62)"/>
  <text x="80" y="120" fill="#A3B3CC" font-size="30" font-family="Arial, sans-serif">AI / Data Center Briefing</text>
  <text x="80" y="210" fill="#EAF1FF" font-size="46" font-weight="700" font-family="Arial, sans-serif">${safeTitle.slice(0, 70)}</text>
  <text x="80" y="530" fill="#B9C9E9" font-size="26" font-family="Arial, sans-serif">Generated fallback artwork</text>
</svg>`;

  await fs.writeFile(outPath, svg, 'utf8');
  return `/generated/${filename}`;
}

async function generateWithGemini(item, apiKey) {
  const prompt = [
    'Nano Banana concept illustration for enterprise AI infrastructure news.',
    'Create a clean editorial image with no logos or text.',
    `Theme: ${item.title}.`,
    'Visual style: modern data center dashboard, cinematic lighting, subtle depth, semiconductors/cloud motifs.',
  ].join(' ');

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_IMAGE_MODEL}:generateContent?key=${apiKey}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.5,
        responseModalities: ['TEXT', 'IMAGE'],
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`gemini image request failed: ${response.status}`);
  }

  const payload = await response.json();
  const parts = payload?.candidates?.[0]?.content?.parts || [];
  const inlinePart = parts.find((part) => part.inlineData?.data);

  if (!inlinePart?.inlineData?.data) {
    throw new Error('no image bytes returned by Gemini');
  }

  const mime = inlinePart.inlineData.mimeType || 'image/png';
  const ext = mime.includes('jpeg') ? 'jpg' : 'png';
  const filename = `${item.id}.${ext}`;
  const outPath = path.join(OUT_DIR, filename);
  const bytes = Buffer.from(inlinePart.inlineData.data, 'base64');

  await fs.writeFile(outPath, bytes);
  return `/generated/${filename}`;
}

export async function ensureArticleImage(item) {
  await ensureOutDir();

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return writePlaceholderSvg(item);
  }

  try {
    return await generateWithGemini(item, apiKey);
  } catch (error) {
    console.error(`[pipeline] image fallback for ${item.id}: ${error.message}`);
    return writePlaceholderSvg(item);
  }
}
