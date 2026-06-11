import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { guardPublicTemplatePhrases } from '../scripts/lib/public-template-phrase-guard.mjs';

const distDir = path.resolve('dist');
const commercialRoutes = ['/subscribe/', '/pricing/', '/sample/', '/briefing/', '/contact/'];
const productionRoutes = ['/', '/archive/', '/rss.xml', '/sitemap.xml', ...commercialRoutes];

function distHtmlPath(routePath) {
  const normalized = routePath.replace(/^\/|\/$/g, '');
  return path.join(distDir, normalized, 'index.html');
}

async function readDistHtml(routePath) {
  return fs.readFile(distHtmlPath(routePath), 'utf8');
}

async function readDistText(routePath) {
  const normalized = routePath.replace(/^\/|\/$/g, '');
  const filePath = normalized ? path.join(distDir, normalized) : path.join(distDir, 'index.html');
  return fs.readFile(filePath, 'utf8');
}

async function distPathExists(routePath) {
  const normalized = routePath.replace(/^\/|\/$/g, '');
  const filePath = routePath.endsWith('.xml')
    ? path.join(distDir, normalized)
    : normalized
      ? path.join(distDir, normalized, 'index.html')
      : path.join(distDir, 'index.html');

  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
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
  const latestSignalsIndex = homepage.indexOf('Latest Signals');

  assert.notEqual(latestSignalsIndex, -1, 'expected Latest Signals section');
  for (const routePath of [...commercialRoutes, '/archive/']) {
    const linkMatch = homepage.match(new RegExp(`href=["']${routePath}["']`));
    assert.ok(linkMatch, `expected homepage link to ${routePath}`);
    assert.ok(linkMatch.index < latestSignalsIndex, `${routePath} should appear before Latest Signals`);
  }
  assert.match(homepage, /href=["']\/pricing\/["']/);
  assert.match(homepage, /href=["']\/contact\/["']/);
});

test('built public production routes exist and indexes exclude admin routes', async () => {
  for (const routePath of productionRoutes) {
    assert.equal(await distPathExists(routePath), true, `expected built route ${routePath}`);
  }

  const rss = await readDistText('/rss.xml');
  const sitemap = await readDistText('/sitemap.xml');
  const archive = await readDistHtml('/archive/');

  assert.match(rss, /<rss\b/i);
  assert.match(sitemap, /<urlset\b/i);
  assert.doesNotMatch(rss, /\/admin(?:\/|%2F)/i, 'RSS should not expose admin routes');
  assert.doesNotMatch(sitemap, /\/admin(?:\/|%2F)/i, 'sitemap should not expose admin routes');
  assert.doesNotMatch(archive, /href=["']\/admin(?:\/|["'])/i, 'archive should not link admin routes');
});

test('commercial routes avoid fake forms, payment surfaces, and template article language', async () => {
  for (const routePath of commercialRoutes) {
    const html = await readDistHtml(routePath);
    assert.doesNotMatch(
      html,
      /<form\b|type=["']email|stripe|checkout|login|credit card|card number|payment processor|payment form/i,
      `${routePath} contains a forbidden conversion/payment surface`,
    );
    assert.doesNotMatch(
      html,
      /\b(sourceUrl|rawText|articlePagePublished|public_status|debug|stack trace|localhost)\b/i,
      `${routePath} leaks article/debug terminology`,
    );

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
