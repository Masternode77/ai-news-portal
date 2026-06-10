import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { guardPublicTemplatePhrases } from '../scripts/lib/public-template-phrase-guard.mjs';

const distDir = path.resolve('dist');
const commercialRoutes = ['/subscribe/', '/pricing/', '/sample/', '/briefing/', '/contact/'];

function distHtmlPath(routePath) {
  const normalized = routePath.replace(/^\/|\/$/g, '');
  return path.join(distDir, normalized, 'index.html');
}

async function readDistHtml(routePath) {
  return fs.readFile(distHtmlPath(routePath), 'utf8');
}

function textContent(html) {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

test('built commercial routes exist with canonical links', async () => {
  for (const routePath of commercialRoutes) {
    const html = await readDistHtml(routePath);
    assert.match(html, new RegExp(`https://www\\.computecurrent\\.com${routePath}`));
  }
});

test('homepage links to the commercial conversion routes and archive', async () => {
  const homepage = await fs.readFile(path.join(distDir, 'index.html'), 'utf8');
  for (const routePath of [...commercialRoutes, '/archive/']) {
    assert.match(homepage, new RegExp(`href=["']${routePath}["']`));
  }
  assert.match(homepage, /Latest Signals/);
});

test('commercial routes avoid fake forms, payment surfaces, and template article language', async () => {
  for (const routePath of commercialRoutes) {
    const html = await readDistHtml(routePath);
    assert.doesNotMatch(html, /<form\b|type=["']email|stripe|checkout|login/i, `${routePath} contains a forbidden conversion/payment surface`);
    assert.doesNotMatch(html, /\b(sourceUrl|rawText|articlePagePublished|public_status)\b/i, `${routePath} leaks article/debug terminology`);

    const text = textContent(html);
    const templateGuard = guardPublicTemplatePhrases(text);
    assert.equal(templateGuard.ok, true, `${routePath} matched public template phrases: ${(templateGuard.reasons || []).join(', ')}`);
  }
});

test('sample page is clearly illustrative and has the required memo sections', async () => {
  const sampleText = textContent(await readDistHtml('/sample/'));
  for (const section of [
    'What changed',
    'Why it matters for AI infrastructure',
    'Who benefits',
    'Who is exposed',
    'Watch next',
    'Confidence notes',
  ]) {
    assert.match(sampleText, new RegExp(section, 'i'));
  }
  assert.match(sampleText, /illustrative sample/i);
  assert.doesNotMatch(sampleText, /\b(reported|announced|confirmed|secured)\b/i);
});
