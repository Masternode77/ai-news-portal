import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { guardPublicTemplatePhrases } from '../scripts/lib/public-template-phrase-guard.mjs';

const distDir = path.resolve('dist');
const legacyOpenRoutes = ['/subscribe/', '/pricing/', '/sample/', '/briefing/'];
const retiredOperationalRoutes = ['/contact/', '/methodology/', '/editorial-policy/', '/ai-disclosure/'];
const publicHomepageLinks = ['/search/', '/archive/', '/rss.xml'];
const productionRoutes = ['/', '/archive/', '/rss.xml', '/sitemap.xml', ...legacyOpenRoutes];

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

function withoutApprovedAdminEntry(html) {
  const approvedEntry = /<a\s+href=["']\/admin\/login\/["']\s+rel=["']nofollow["']>Admin<\/a>/gi;
  const matches = html.match(approvedEntry) || [];
  assert.equal(matches.length, 1, 'expected one discreet nofollow Admin login link');
  return html.replace(approvedEntry, '');
}

test('legacy conversion routes render as noindex public reference pages', async () => {
  for (const routePath of legacyOpenRoutes) {
    const html = await readDistHtml(routePath);
    assert.match(html, new RegExp(`https://www\\.computecurrent\\.com${routePath}`));
    assert.match(html, /<meta name="robots" content="noindex,nofollow">/);
  }
});

test('homepage links to publication surfaces before the current edition', async () => {
  const homepage = await fs.readFile(path.join(distDir, 'index.html'), 'utf8');
  const latestAnalysisIndex = homepage.indexOf('Latest intelligence');

  assert.notEqual(latestAnalysisIndex, -1, 'expected latest intelligence section');
  for (const routePath of publicHomepageLinks) {
    const linkMatch = homepage.match(new RegExp(`href=["']${routePath}["']`));
    assert.ok(linkMatch, `expected homepage link to ${routePath}`);
    assert.ok(linkMatch.index < latestAnalysisIndex, `${routePath} should appear before Latest Analysis`);
  }
  for (const routePath of retiredOperationalRoutes) {
    assert.doesNotMatch(homepage, new RegExp(`href=["']${routePath}["']`), `homepage should not link retired operational route ${routePath}`);
  }
  for (const routePath of legacyOpenRoutes.filter((routePath) => routePath !== '/sample/')) {
    assert.doesNotMatch(homepage, new RegExp(`href=["']${routePath}["']`), `homepage should not link legacy conversion route ${routePath}`);
  }
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
  assert.doesNotMatch(
    withoutApprovedAdminEntry(archive),
    /href=["']\/admin(?:\/|["'])/i,
    'archive should expose only the approved Admin login link',
  );
});

test('public conversion routes avoid paid surfaces and template article language', async () => {
  for (const routePath of legacyOpenRoutes) {
    const html = await readDistHtml(routePath);
    const text = textContent(html);
    assert.doesNotMatch(html, /href=["']\/admin(?:\/|["'])/i, `${routePath} should not expose admin navigation`);
    assert.doesNotMatch(
      text,
      /stripe|checkout|login|credit card|card number|payment processor|payment form|request pricing|see pricing|founding subscriber|team subscription|custom executive|executive briefing|custom briefing|get the weekly|paid|paywall|subscriber would receive/i,
      `${routePath} contains a forbidden conversion/payment surface`,
    );
    assert.doesNotMatch(html, /<form\b|type=["']email/i, `${routePath} contains a forbidden form surface`);
    assert.doesNotMatch(
      html,
      /\b(sourceUrl|rawText|articlePagePublished|public_status|debug|stack trace|localhost)\b/i,
      `${routePath} leaks article/debug terminology`,
    );
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
