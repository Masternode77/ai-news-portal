import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import latestNews from '../src/data/latest-news.json' with { type: 'json' };
import archivedNews from '../src/data/archived-news.json' with { type: 'json' };
import { CORE_RELEVANCE_THRESHOLD, CORE_LANE_KEYS, routePublicLane } from './lib/public-lane-router.mjs';
import { buildPublicPresentation } from './lib/public-presentation.mjs';
import {
  duplicateFirstWordPrefixes,
  firstWords,
  forbiddenPublicPhraseMatches,
  repeatedParagraphFingerprints,
} from './lib/copy-quality-guard.mjs';
import { detectTruncationArtifacts } from './lib/truncation-detector.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST_DIR = path.join(ROOT, 'dist');
const REPORT_PATH = path.join(ROOT, 'docs/public-surface-regression-report.md');
const ARTICLE_LIMIT = Number(process.env.PUBLIC_SURFACE_ARTICLE_LIMIT || 30);
const DEBUG_LABELS = [
  'Relevance Score',
  'Urgency Score',
  'Extraction Quality',
  'Article Blueprint',
  'raw extraction_quality_score',
  'raw relevance_score',
  'raw urgency_score',
  'model confidence',
  'debug confidence',
];

const ARTICLE_BY_ID = new Map([...latestNews, ...archivedNews].map((article) => [article.id, article]));

function decodeHtml(text = '') {
  return String(text)
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
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

function articleLinks(homeHtml = '') {
  const links = [...homeHtml.matchAll(/href=["'](\/news\/([^/"'#?]+)\/?)["']/g)]
    .map((match) => ({ href: match[1].endsWith('/') ? match[1] : `${match[1]}/`, id: match[2] }));
  const seen = new Set();
  return links.filter((link) => {
    if (seen.has(link.href)) return false;
    seen.add(link.href);
    return true;
  }).slice(0, ARTICLE_LIMIT);
}

function homepageCards(homeHtml = '') {
  return [...homeHtml.matchAll(/<article\b[^>]*data-public-card[^>]*>[\s\S]*?<\/article>/gi)].map((match) => {
    const html = match[0];
    const id = html.match(/data-article-id=["']([^"']+)["']/i)?.[1] || '';
    const lane = html.match(/data-lane=["']([^"']+)["']/i)?.[1] || '';
    const deckAttr = html.match(/data-deck=["']([^"']*)["']/i)?.[1] || '';
    const deck = decodeHtml(deckAttr) || stripHtml(html.match(/class=["'][^"']*signal-deck[^"']*["'][^>]*>([\s\S]*?)<\/p>/i)?.[1] || '');
    return { id, lane, deck, html, text: stripHtml(html) };
  });
}

function articleParagraphs(html = '') {
  const section = html.match(/<section class=["'][^"']*detail-article-copy[^"']*["'][^>]*>([\s\S]*?)<\/section>/i)?.[1] || '';
  return [...section.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((match) => stripHtml(match[1]))
    .filter(Boolean);
}

function articleHeadingSequence(html = '') {
  const section = html.match(/<section class=["'][^"']*detail-article-copy[^"']*["'][^>]*>([\s\S]*?)<\/section>/i)?.[1] || '';
  return [...section.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/gi)]
    .map((match) => stripHtml(match[1]))
    .filter(Boolean)
    .join(' > ');
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function fileForRequest(urlPath = '/') {
  const cleanPath = decodeURIComponent(urlPath.split('?')[0]).replace(/^\/+/, '');
  const direct = path.join(DIST_DIR, cleanPath);
  const index = path.join(DIST_DIR, cleanPath, 'index.html');
  if (await pathExists(index)) return index;
  if (await pathExists(direct) && !(await fs.stat(direct)).isDirectory()) return direct;
  return path.join(DIST_DIR, 'index.html');
}

async function startStaticServer() {
  const server = http.createServer(async (req, res) => {
    try {
      const filePath = await fileForRequest(req.url || '/');
      const body = await fs.readFile(filePath);
      const ext = path.extname(filePath);
      const contentType = ext === '.html' ? 'text/html; charset=utf-8' : 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end('not found');
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

async function fetchText(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`fetch failed ${response.status} ${url}`);
  return response.text();
}

function debugLeaks(text = '') {
  return DEBUG_LABELS.filter((label) => new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(text));
}

function lowRelevanceCoreViolations(cards = []) {
  return cards.filter((card) => {
    if (!CORE_LANE_KEYS.has(card.lane)) return false;
    const record = ARTICLE_BY_ID.get(card.id);
    const score = Number(record?.infrastructure_relevance_score ?? record?.infrastructure_relevance?.infrastructure_relevance_score ?? 1);
    return Number.isFinite(score) && score < CORE_RELEVANCE_THRESHOLD;
  });
}

function beforeAfterExamples(limit = 10) {
  return [...ARTICLE_BY_ID.values()]
    .filter((article) => article.regeneration_v2_audit && article.public_presentation)
    .slice(0, limit)
    .map((article) => {
      const route = routePublicLane(article);
      const presentation = buildPublicPresentation(article, { route });
      return {
        title: article.title,
        oldDeck: article.regeneration_v2_audit.old_public_deck,
        newDeck: presentation.deck,
        oldLane: article.regeneration_v2_audit.old_lane,
        newLane: presentation.lane_title,
      };
    });
}

export async function runAudit(options = {}) {
  let server = null;
  const baseUrl = (options.baseUrl || process.env.PUBLIC_SURFACE_BASE_URL || '').replace(/\/$/, '');
  let resolvedBaseUrl = baseUrl;
  if (!resolvedBaseUrl) {
    if (!(await pathExists(path.join(DIST_DIR, 'index.html')))) {
      throw new Error('dist/index.html is missing. Run npm run build before audit:public-surface.');
    }
    server = await startStaticServer();
    resolvedBaseUrl = server.baseUrl;
  }

  try {
    const failures = [];
    const homeHtml = await fetchText(`${resolvedBaseUrl}/`);
    const cards = homepageCards(homeHtml);
    const links = articleLinks(homeHtml);
    const pages = [];

    for (const link of links) {
      const url = `${resolvedBaseUrl}${link.href}`;
      const html = await fetchText(url);
      pages.push({
        ...link,
        url,
        html,
        text: stripHtml(html),
        paragraphs: articleParagraphs(html),
        headingSequence: articleHeadingSequence(html),
      });
    }

    const publicPages = [
      { id: 'homepage', url: `${resolvedBaseUrl}/`, html: homeHtml, text: stripHtml(homeHtml), paragraphs: [] },
      ...pages,
    ];

    let debugLeakCount = 0;
    let forbiddenPhraseCount = 0;
    let truncationArtifactCount = 0;
    for (const page of publicPages) {
      const leaks = debugLeaks(page.text);
      debugLeakCount += leaks.length;
      if (leaks.length) failures.push(`${page.url} leaks debug labels: ${leaks.join(', ')}`);

      const forbidden = forbiddenPublicPhraseMatches(page.text);
      forbiddenPhraseCount += forbidden.length;
      if (forbidden.length) failures.push(`${page.url} contains forbidden phrases: ${forbidden.join(', ')}`);

      const truncation = detectTruncationArtifacts(page.text, { allowEllipsis: true });
      truncationArtifactCount += truncation.artifacts.length;
      if (!truncation.ok) failures.push(`${page.url} contains truncation artifacts: ${truncation.artifacts.join(', ')}`);
    }

    const duplicateHookPrefixes = duplicateFirstWordPrefixes(cards.map((card) => ({ id: card.id, text: card.deck })), 8);
    for (const duplicate of duplicateHookPrefixes) {
      failures.push(`duplicate homepage deck prefix: ${duplicate.prefix}`);
    }

    const repeatedParagraphs = repeatedParagraphFingerprints(pages);
    for (const repeat of repeatedParagraphs) {
      failures.push(`paragraph repeats between ${repeat.first.url} and ${repeat.second.url}`);
    }

    const lowRelevanceViolations = lowRelevanceCoreViolations(cards);
    for (const card of lowRelevanceViolations) {
      failures.push(`low relevance item ${card.id} appears in core lane ${card.lane}`);
    }

    const headingCounts = new Map();
    for (const page of pages) {
      if (!page.headingSequence) continue;
      headingCounts.set(page.headingSequence, (headingCounts.get(page.headingSequence) || 0) + 1);
    }
    for (const [sequence, count] of headingCounts.entries()) {
      if (count > 2) failures.push(`detail heading sequence appears ${count} times: ${sequence}`);
    }

    const examples = beforeAfterExamples(10);
    const report = [
      '# Public Surface Regression Report',
      '',
      `Generated at: ${new Date().toISOString()}`,
      `Base URL: ${resolvedBaseUrl}`,
      `Homepage cards checked: ${cards.length}`,
      `Detail pages checked: ${pages.length}`,
      '',
      '## Counts',
      '',
      `- Public debug metadata leaks: ${debugLeakCount}`,
      `- Forbidden phrase leaks: ${forbiddenPhraseCount}`,
      `- Duplicate hook prefixes: ${duplicateHookPrefixes.length}`,
      `- Repeated paragraph fingerprints: ${repeatedParagraphs.length}`,
      `- Low-relevance core-lane violations: ${lowRelevanceViolations.length}`,
      `- Truncation artifacts: ${truncationArtifactCount}`,
      '',
      '## Before / After Examples',
      '',
      ...(examples.length ? examples.flatMap((example) => [
        `### ${example.title}`,
        `- Old deck: ${example.oldDeck || 'n/a'}`,
        `- New deck: ${example.newDeck || 'n/a'}`,
        `- Old lane: ${example.oldLane || 'n/a'}`,
        `- New lane: ${example.newLane || 'n/a'}`,
        '',
      ]) : ['- No regeneration examples found.']),
      '',
      '## Failures',
      '',
      ...(failures.length ? failures.map((failure) => `- ${failure}`) : ['- None']),
      '',
      '## Checked Detail URLs',
      '',
      ...pages.map((page) => `- ${page.url}`),
    ].join('\n');

    await fs.writeFile(REPORT_PATH, `${report}\n`, 'utf8');
    if (failures.length) {
      const error = new Error(`public surface audit failed with ${failures.length} failures`);
      error.failures = failures;
      throw error;
    }
    console.log(`public surface audit passed for ${resolvedBaseUrl}`);
    return {
      ok: true,
      cards,
      pages,
      counts: {
        debugLeakCount,
        forbiddenPhraseCount,
        duplicateHookPrefixes: duplicateHookPrefixes.length,
        repeatedParagraphs: repeatedParagraphs.length,
        lowRelevanceViolations: lowRelevanceViolations.length,
        truncationArtifactCount,
      },
    };
  } finally {
    if (server) await server.close();
  }
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  await runAudit();
}
