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
  ['POWER', '#fbbf24'],
  ['DATA CENTERS', '#22d3ee'],
  ['CLOUD', '#60a5fa'],
  ['SILICON', '#a78bfa'],
  ['COOLING', '#7dd3fc'],
  ['CAPITAL', '#34d399'],
];

const laneChips = LANES.map(([label, color], index) => {
  const width = 36 + label.length * 13.2;
  const offsets = [];
  let x = 96;
  for (let i = 0; i < index; i += 1) {
    offsets.push(36 + LANES[i][0].length * 13.2);
  }
  x += offsets.reduce((sum, w) => sum + w + 14, 0);
  return `
    <g transform="translate(${x}, 484)">
      <rect width="${width}" height="46" rx="23" fill="rgba(255,255,255,0.045)" stroke="rgba(148,178,255,0.22)" />
      <circle cx="22" cy="23" r="5" fill="${color}" />
      <text x="38" y="30" font-family="DejaVu Sans Mono, Menlo, monospace" font-size="19" letter-spacing="2" fill="#c9d6f2">${label}</text>
    </g>`;
}).join('');

const gridLines = (() => {
  const lines = [];
  for (let x = 0; x <= 1200; x += 60) {
    lines.push(`<line x1="${x}" y1="0" x2="${x}" y2="630" stroke="rgba(148,178,255,0.05)" stroke-width="1"/>`);
  }
  for (let y = 0; y <= 630; y += 60) {
    lines.push(`<line x1="0" y1="${y}" x2="1200" y2="${y}" stroke="rgba(148,178,255,0.05)" stroke-width="1"/>`);
  }
  return lines.join('');
})();

const svg = `<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="brand" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#22d3ee"/>
      <stop offset="52%" stop-color="#60a5fa"/>
      <stop offset="100%" stop-color="#a78bfa"/>
    </linearGradient>
    <radialGradient id="glowA" cx="18%" cy="-8%" r="70%">
      <stop offset="0%" stop-color="rgba(34,211,238,0.30)"/>
      <stop offset="100%" stop-color="rgba(34,211,238,0)"/>
    </radialGradient>
    <radialGradient id="glowB" cx="88%" cy="4%" r="66%">
      <stop offset="0%" stop-color="rgba(139,92,246,0.28)"/>
      <stop offset="100%" stop-color="rgba(139,92,246,0)"/>
    </radialGradient>
    <linearGradient id="fadeGrid" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="white" stop-opacity="0.9"/>
      <stop offset="80%" stop-color="white" stop-opacity="0.15"/>
      <stop offset="100%" stop-color="white" stop-opacity="0"/>
    </linearGradient>
    <mask id="gridMask"><rect width="1200" height="630" fill="url(#fadeGrid)"/></mask>
  </defs>

  <rect width="1200" height="630" fill="#04060c"/>
  <g mask="url(#gridMask)">${gridLines}</g>
  <rect width="1200" height="630" fill="url(#glowA)"/>
  <rect width="1200" height="630" fill="url(#glowB)"/>

  <rect x="96" y="96" width="120" height="6" rx="3" fill="url(#brand)"/>
  <text x="96" y="158" font-family="DejaVu Sans Mono, Menlo, monospace" font-size="26" letter-spacing="9" fill="#7ee7fb">AI INFRASTRUCTURE INTELLIGENCE</text>

  <text x="90" y="292" font-family="DejaVu Sans, Arial, sans-serif" font-size="128" font-weight="bold" letter-spacing="-3" fill="#f4f7ff">Compute</text>
  <text x="90" y="420" font-family="DejaVu Sans, Arial, sans-serif" font-size="128" font-weight="bold" letter-spacing="-3" fill="url(#brand)">Current</text>

  <text x="96" y="462" font-family="DejaVu Sans, Arial, sans-serif" font-size="27" fill="#9aa7c4">Source-linked analysis on power, data centers, silicon, and capital.</text>

  ${laneChips}

  <line x1="96" y1="566" x2="1104" y2="566" stroke="rgba(148,178,255,0.16)" stroke-width="1"/>
  <text x="96" y="600" font-family="DejaVu Sans Mono, Menlo, monospace" font-size="21" letter-spacing="2" fill="#8fa3cc">computecurrent.com</text>
  <text x="1104" y="600" text-anchor="end" font-family="DejaVu Sans Mono, Menlo, monospace" font-size="21" letter-spacing="2" fill="#8fa3cc">UPDATED EVERY 8 HOURS</text>
</svg>`;

await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile(OUT);
const { size } = await fs.stat(OUT);
console.log(`og-default.png written (${Math.round(size / 1024)} KB)`);
