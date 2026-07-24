// Renders the default Open Graph card (public/og-default.png, 1200x630).
// SVG social cards are ignored by most platforms, so the shareable default
// must be a raster. Run `node scripts/generate-og-default.mjs` after brand
// changes and commit the regenerated PNG.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'public', 'og-default.png');

const LANES = [
  ['POWER', '#ff9f0a'],
  ['DATA CENTERS', '#32ade6'],
  ['CLOUD', '#007aff'],
  ['SILICON', '#af52de'],
  ['COOLING', '#64d2ff'],
  ['CAPITAL', '#34c759'],
];

const laneChips = LANES.map(([label, color], index) => {
  const width = 36 + label.length * 13.2;
  const offsets = [];
  for (let i = 0; i < index; i += 1) {
    offsets.push(36 + LANES[i][0].length * 13.2);
  }
  const x = 96 + offsets.reduce((sum, w) => sum + w + 14, 0);
  return `
    <g transform="translate(${x}, 478)">
      <rect width="${width}" height="46" rx="23" fill="#f5f5f7" />
      <circle cx="22" cy="23" r="5" fill="${color}" />
      <text x="38" y="30" font-family="DejaVu Sans, Arial, sans-serif" font-size="18" font-weight="600" letter-spacing="1.5" fill="#424245">${label}</text>
    </g>`;
}).join('');

const svg = `<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="mark" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0a84ff"/>
      <stop offset="100%" stop-color="#0066cc"/>
    </linearGradient>
  </defs>

  <rect width="1200" height="630" fill="#ffffff"/>

  <g transform="translate(96, 88)">
    <rect width="56" height="56" rx="14" fill="url(#mark)"/>
    <rect x="12" y="20" width="32" height="6" rx="3" fill="#ffffff" fill-opacity="0.95"/>
    <rect x="18" y="34" width="20" height="6" rx="3" fill="#ffffff" fill-opacity="0.6"/>
  </g>
  <text x="176" y="112" font-family="DejaVu Sans, Arial, sans-serif" font-size="26" font-weight="600" letter-spacing="4" fill="#6e6e73">AI INFRASTRUCTURE INTELLIGENCE</text>
  <text x="176" y="140" font-family="DejaVu Sans, Arial, sans-serif" font-size="0" fill="#6e6e73"> </text>

  <text x="90" y="298" font-family="DejaVu Sans, Arial, sans-serif" font-size="124" font-weight="bold" letter-spacing="-3" fill="#1d1d1f">Compute</text>
  <text x="90" y="418" font-family="DejaVu Sans, Arial, sans-serif" font-size="124" font-weight="bold" letter-spacing="-3" fill="#0071e3">Current</text>

  <text x="96" y="456" font-family="DejaVu Sans, Arial, sans-serif" font-size="26" fill="#6e6e73">Source-linked analysis on power, data centers, silicon, and capital.</text>

  ${laneChips}

  <line x1="96" y1="562" x2="1104" y2="562" stroke="rgba(0,0,0,0.1)" stroke-width="1"/>
  <text x="96" y="598" font-family="DejaVu Sans, Arial, sans-serif" font-size="21" font-weight="600" letter-spacing="1" fill="#6e6e73">computecurrent.com</text>
  <text x="1104" y="598" text-anchor="end" font-family="DejaVu Sans, Arial, sans-serif" font-size="21" letter-spacing="1" fill="#a1a1a6">Updated several times a day</text>
</svg>`;

await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile(OUT);
const { size } = await fs.stat(OUT);
console.log(`og-default.png written (${Math.round(size / 1024)} KB)`);
