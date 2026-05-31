import fs from 'node:fs/promises';
import path from 'node:path';
import { duplicateFirstWordPrefixes, firstWords, forbiddenPublicPhraseMatches } from './copy-quality-guard.mjs';
import { detectTruncationArtifacts } from './truncation-detector.mjs';

const DEFAULT_REPORT_PATH = 'docs/rendered-public-output-report.md';
const BOILERPLATE = /want more .* stories|copyright ©|all rights reserved|sign up for.+newsletter/i;
const RENDERED_FALSE_POSITIVE_PHRASES = new Set(['Continue reading', 'after [source] reported']);

function decodeHtml(value = '') {
  return String(value)
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function stripHtml(html = '') {
  return decodeHtml(String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

async function readIfExists(filePath) {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch {
    return '';
  }
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function walk(dir) {
  if (!(await exists(dir))) return [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const out = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await walk(full));
    else out.push(full);
  }
  return out;
}

function cardRecords(html = '') {
  return [...html.matchAll(/<article\b[^>]*data-public-card[^>]*>[\s\S]*?<\/article>/gi)].map((match, index) => {
    const card = match[0];
    const id = card.match(/data-article-id=["']([^"']+)["']/i)?.[1] || `card-${index}`;
    const deckAttr = card.match(/data-deck=["']([^"']*)["']/i)?.[1] || '';
    const deckHtml = card.match(/<p\b[^>]*class=["'][^"']*(?:signal-deck|article-deck)[^"']*["'][^>]*>([\s\S]*?)<\/p>/i)?.[1] || '';
    return { id, text: stripHtml(card), deck: decodeHtml(deckAttr) || stripHtml(deckHtml), hasImage: /<img\b/i.test(card) };
  });
}

function articleBody(html = '') {
  const section = html.match(/<section\b[^>]*class=["'][^"']*detail-article-copy[^"']*["'][^>]*>([\s\S]*?)<\/section>/i)?.[1] ||
    html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i)?.[1] || html;
  return stripHtml(section);
}

function localImageSources(html = '') {
  return [...html.matchAll(/<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)]
    .map((match) => match[1])
    .filter((src) => src.startsWith('/') && !src.startsWith('//'));
}

function publicPath(filePath = '', distDir = 'dist') {
  const relative = path.relative(distDir, filePath).replaceAll(path.sep, '/');
  if (relative === 'index.html') return '/';
  return `/${relative.replace(/\/index\.html$/, '/').replace(/\.html$/, '/')}`;
}

async function renderedPages(distDir, articleLimit) {
  const files = await walk(distDir);
  const articleFiles = files
    .filter((file) => /\/news\/[^/]+\/index\.html$/.test(file.replaceAll(path.sep, '/')))
    .sort()
    .slice(0, articleLimit);
  const fixedFiles = [
    path.join(distDir, 'index.html'),
    path.join(distDir, 'archive/index.html'),
    path.join(distDir, 'rss.xml'),
    path.join(distDir, 'sitemap.xml'),
    ...files.filter((file) => /sitemap(?:-\d+|-index)?\.xml$/.test(path.basename(file))).sort(),
  ];
  const unique = [...new Set([...fixedFiles, ...articleFiles])];
  const pages = [];
  for (const file of unique) {
    const html = await readIfExists(file);
    if (html) pages.push({ file, path: publicPath(file, distDir), html, text: stripHtml(html), body: articleBody(html) });
  }
  return pages;
}

async function imageExists(distDir, src) {
  return exists(path.join(distDir, decodeURIComponent(src).replace(/^\//, '')));
}

function duplicateOpenings(pages = []) {
  const seen = new Map();
  const duplicates = [];
  for (const page of pages.filter((item) => item.path.startsWith('/news/'))) {
    const prefix = firstWords(page.body, 12);
    if (!prefix) continue;
    if (seen.has(prefix)) duplicates.push({ prefix, first: seen.get(prefix), second: page.path });
    else seen.set(prefix, page.path);
  }
  return duplicates;
}

function pageTextFailures(page = {}) {
  const failures = [];
  const checkedText = page.path.startsWith('/news/') ? page.body : page.text;
  const forbidden = forbiddenPublicPhraseMatches(checkedText)
    .filter((phrase) => !RENDERED_FALSE_POSITIVE_PHRASES.has(phrase));
  if (forbidden.length) failures.push(`${page.path}: forbidden phrase ${forbidden.join(', ')}`);
  const truncation = detectTruncationArtifacts(checkedText, { allowEllipsis: true });
  if (!truncation.ok) failures.push(`${page.path}: clipped text ${truncation.artifacts.join(', ')}`);
  if (BOILERPLATE.test(checkedText)) failures.push(`${page.path}: source boilerplate leak`);
  return failures;
}

async function imageFailures(distDir, pages = []) {
  const failures = [];
  for (const page of pages) {
    for (const src of localImageSources(page.html)) {
      if (!(await imageExists(distDir, src))) failures.push(`${page.path}: broken image ${src}`);
    }
  }
  return failures;
}

async function writeReport(reportPath, result) {
  if (!reportPath) return;
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  const lines = [
    '# Rendered Public Output Report',
    '',
    `Generated at: ${new Date().toISOString()}`,
    `Pages checked: ${result.counts.pages}`,
    `Article pages checked: ${result.counts.articlePages}`,
    `Cards checked: ${result.counts.cards}`,
    `Broken images: ${result.counts.brokenImages}`,
    '',
    '## Failures',
    '',
    ...(result.failures.length ? result.failures.map((failure) => `- ${failure}`) : ['- None']),
    '',
  ];
  await fs.writeFile(reportPath, lines.join('\n'), 'utf8');
}

export async function auditRenderedPublicOutput(options = {}) {
  const distDir = options.distDir || 'dist';
  const articleLimit = Number(options.articleLimit || process.env.PUBLIC_OUTPUT_ARTICLE_LIMIT || 50);
  const minLongformCharacters = Number(options.minLongformCharacters || process.env.PUBLIC_OUTPUT_MIN_LONGFORM_CHARS || 4500);
  const pages = await renderedPages(distDir, articleLimit);
  const failures = [];
  const home = pages.find((page) => page.path === '/');
  const archive = pages.find((page) => page.path === '/archive/');
  if (!home) failures.push('homepage missing from rendered output');
  if (!archive) failures.push('archive missing from rendered output');

  for (const page of pages) failures.push(...pageTextFailures(page));
  const cards = cardRecords(home?.html || '');
  for (const card of cards.filter((item) => !item.hasImage)) failures.push(`card ${card.id}: missing image`);
  for (const duplicate of duplicateFirstWordPrefixes(cards.map((card) => card.deck).filter(Boolean), 8)) {
    failures.push(`duplicate deck prefix ${duplicate.prefix}`);
  }
  for (const duplicate of duplicateOpenings(pages)) failures.push(`duplicate article opening ${duplicate.prefix}`);
  for (const page of pages.filter((item) => item.path.startsWith('/news/') && item.body)) {
    if (page.body.length < minLongformCharacters) failures.push(`${page.path}: longform below ${minLongformCharacters} characters`);
  }
  const brokenImages = await imageFailures(distDir, pages);
  failures.push(...brokenImages);

  const result = {
    ok: failures.length === 0,
    failures,
    counts: {
      pages: pages.length,
      articlePages: pages.filter((page) => page.path.startsWith('/news/')).length,
      cards: cards.length,
      brokenImages: brokenImages.length,
    },
  };
  await writeReport(options.reportPath, result);
  return result;
}

export const renderedOutputReportPath = DEFAULT_REPORT_PATH;
