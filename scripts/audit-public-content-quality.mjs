import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import latestNews from '../src/data/latest-news.json' with { type: 'json' };
import archivedNews from '../src/data/archived-news.json' with { type: 'json' };
import { CORE_LANE_KEYS, CORE_RELEVANCE_THRESHOLD, routePublicLane } from './lib/public-lane-router.mjs';
import { publicTemplatePhraseMatches } from './lib/public-template-phrase-guard.mjs';
import { detectBoilerplate } from './lib/boilerplate-detector.mjs';
import { detectTruncationArtifacts } from './lib/truncation-detector.mjs';
import { duplicateFirstWordPrefixes, repeatedParagraphFingerprints } from './lib/copy-quality-guard.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST_DIR = path.join(ROOT, 'dist');
const REPORT_PATH = path.join(ROOT, 'docs/public-content-quality-audit-report.md');
const ARTICLE_LIMIT = Number(process.env.PUBLIC_CONTENT_QUALITY_ARTICLE_LIMIT || 50);

const ARTICLE_BY_ID = new Map([...latestNews, ...archivedNews].map((article) => [article.id, article]));

const DIRECT_FAIL_STRINGS = [
  'The issue is no longer demand alone',
  "Editor's Brief",
  'The practical issue is whether demand can be converted',
  'Watch execution details, customer commitments',
  'Read narrowly, this is one more item',
  'The financial question is whether',
  'The market tends to price the demand story first',
  'The next signal to watch is customer commitments',
  'Want more Data Center Knowledge stories',
  'Copyright © 2026 TechTarget',
  'registered office',
  'This website is owned and operated',
  'fuelin.',
  'clo.',
  'Hundreds o.',
];

const LOW_VALUE_CORE_PATTERNS = [
  /\b(?:rx|rtx|radeon|geforce)\s?\d{3,4}\b.{0,120}\b(?:deal|discount|off|save|amazon)\b/i,
  /\b(?:deal|discount|off|save|amazon)\b.{0,120}\b(?:rx|rtx|radeon|geforce)\s?\d{3,4}\b/i,
  /\blaptop review\b/i,
  /\bdell xps\b/i,
  /\bcommencement\b/i,
  /\brecruitment spam\b/i,
  /\blinkedin\b.{0,80}\brecruit/i,
  /\bsports ai\b/i,
  /\bpaul tudor jones\b/i,
];

const SOURCE_BOILERPLATE_LEAK_PATTERN = /techtarget|registered office|registered in england|owned and operated|all copyright resides|site feedback|take our survey|bookmark save|share on|copyright ©/i;

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

export function parseHomepageCards(homeHtml = '') {
  return [...homeHtml.matchAll(/<article\b[^>]*data-public-card[^>]*>[\s\S]*?<\/article>/gi)].map((match) => {
    const html = match[0];
    const id = html.match(/data-article-id=["']([^"']+)["']/i)?.[1] || '';
    const lane = html.match(/data-lane=["']([^"']+)["']/i)?.[1] || '';
    const deckAttr = html.match(/data-deck=["']([^"']*)["']/i)?.[1] || '';
    const deck = decodeHtml(deckAttr) || stripHtml(html.match(/class=["'][^"']*(?:signal-deck|article-deck)[^"']*["'][^>]*>([\s\S]*?)<\/p>/i)?.[1] || '');
    return { id, lane, deck, html, text: stripHtml(html) };
  });
}

function articleParagraphs(html = '') {
  const section = html.match(/<section class=["'][^"']*detail-article-copy[^"']*["'][^>]*>([\s\S]*?)<\/section>/i)?.[1] || '';
  return [...section.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)].map((match) => stripHtml(match[1])).filter(Boolean);
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
  return null;
}

async function startStaticServer() {
  const server = http.createServer(async (req, res) => {
    try {
      const filePath = await fileForRequest(req.url || '/');
      if (!filePath) {
        res.writeHead(404);
        res.end('not found');
        return;
      }
      const body = await fs.readFile(filePath);
      const ext = path.extname(filePath);
      const contentType = ext === '.html'
        ? 'text/html; charset=utf-8'
        : ext === '.xml'
          ? 'application/xml; charset=utf-8'
          : 'application/octet-stream';
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

async function fetchText(url, optional = false) {
  const response = await fetch(url);
  if (!response.ok) {
    if (optional) return '';
    throw new Error(`fetch failed ${response.status} ${url}`);
  }
  return response.text();
}

function directStringMatches(text = '') {
  return DIRECT_FAIL_STRINGS.filter((value) => new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(text));
}

function lowValueCoreCards(cards = []) {
  return cards.filter((card) => CORE_LANE_KEYS.has(card.lane) && LOW_VALUE_CORE_PATTERNS.some((pattern) => pattern.test(card.text)));
}

function lowRelevanceCoreCards(cards = []) {
  return cards.filter((card) => {
    if (!CORE_LANE_KEYS.has(card.lane)) return false;
    const record = ARTICLE_BY_ID.get(card.id);
    const score = Number(record?.infrastructure_relevance_score ?? record?.relevance_score ?? record?.infrastructure_relevance?.infrastructure_relevance_score ?? routePublicLane(record || {}).score);
    return Number.isFinite(score) && score < CORE_RELEVANCE_THRESHOLD;
  });
}

function quarantinedIds() {
  return [...ARTICLE_BY_ID.values()]
    .filter((article) => article.public_status === 'quarantined' || article.public_status === 'archive_only_noindex' || article.archiveOnly === true)
    .map((article) => article.id);
}

function oldTemplateStructure(text = '') {
  return /editor'?s brief/i.test(text)
    || /financial question|operating question|customer question/i.test(text)
    || /power, cooling, silicon supply, or permitting becomes the real bottleneck/i.test(text);
}

export async function runContentQualityAudit(options = {}) {
  let server = null;
  const baseUrl = (options.baseUrl || process.env.PUBLIC_CONTENT_QUALITY_BASE_URL || '').replace(/\/$/, '');
  let resolvedBaseUrl = baseUrl;
  if (!resolvedBaseUrl) {
    if (!(await pathExists(path.join(DIST_DIR, 'index.html')))) {
      throw new Error('dist/index.html is missing. Run npm run build before audit:content-quality.');
    }
    server = await startStaticServer();
    resolvedBaseUrl = server.baseUrl;
  }

  try {
    const failures = [];
    const homeHtml = await fetchText(`${resolvedBaseUrl}/`);
    const cards = parseHomepageCards(homeHtml);
    const links = articleLinks(homeHtml);
    const pages = [];

    for (const link of links) {
      const html = await fetchText(`${resolvedBaseUrl}${link.href}`, true);
      if (!html) continue;
      pages.push({
        ...link,
        url: `${resolvedBaseUrl}${link.href}`,
        html,
        text: stripHtml(html),
        paragraphs: articleParagraphs(html),
      });
    }

    const sitemap = await fetchText(`${resolvedBaseUrl}/sitemap-index.xml`, true)
      || await fetchText(`${resolvedBaseUrl}/sitemap-0.xml`, true)
      || '';
    const rss = await fetchText(`${resolvedBaseUrl}/rss.xml`, true) || '';
    const publicPages = [
      { id: 'homepage', url: `${resolvedBaseUrl}/`, html: homeHtml, text: stripHtml(homeHtml), paragraphs: [] },
      ...pages,
      ...(sitemap ? [{ id: 'sitemap', url: `${resolvedBaseUrl}/sitemap`, html: sitemap, text: stripHtml(sitemap), paragraphs: [] }] : []),
      ...(rss ? [{ id: 'rss', url: `${resolvedBaseUrl}/rss.xml`, html: rss, text: stripHtml(rss), paragraphs: [] }] : []),
    ];

    let directMatches = 0;
    let templateMatches = 0;
    let boilerplateMatches = 0;
    let truncationMatches = 0;
    for (const page of publicPages) {
      const direct = directStringMatches(page.text);
      directMatches += direct.length;
      if (direct.length) failures.push(`${page.url} contains blocked strings: ${direct.join(', ')}`);

      const template = publicTemplatePhraseMatches(page.text);
      templateMatches += template.length;
      if (template.length) failures.push(`${page.url} contains template phrases: ${template.map((match) => match.phrase).join(', ')}`);

      const boilerplate = detectBoilerplate(page.text);
      const sourceBoilerplateMatches = [
        ...boilerplate.boilerplate_matches,
        ...boilerplate.copyright_matches,
        ...boilerplate.nav_or_cta_matches,
      ].filter((match) => SOURCE_BOILERPLATE_LEAK_PATTERN.test(match));
      const hasBoilerplate = boilerplate.copyright_footer_detected
        || sourceBoilerplateMatches.length > 0
        || boilerplate.boilerplate_ratio > 0.08;
      if (hasBoilerplate) {
        boilerplateMatches += sourceBoilerplateMatches.length || boilerplate.boilerplate_matches.length || 1;
        failures.push(`${page.url} contains source boilerplate: ${sourceBoilerplateMatches.slice(0, 6).join(', ') || boilerplate.boilerplate_matches.slice(0, 6).join(', ')}`);
      }

      const truncation = detectTruncationArtifacts(page.text, { allowEllipsis: true });
      truncationMatches += truncation.artifacts.length;
      if (!truncation.ok) failures.push(`${page.url} contains clipped fragments: ${truncation.artifacts.join(', ')}`);

      if (page.id !== 'homepage' && oldTemplateStructure(page.text)) {
        failures.push(`${page.url} contains fixed old template structure`);
      }
    }

    const duplicateDeckPrefixes = duplicateFirstWordPrefixes(cards.map((card) => ({ id: card.id, text: card.deck })), 8);
    duplicateDeckPrefixes.forEach((duplicate) => failures.push(`duplicate homepage deck prefix: ${duplicate.prefix}`));

    const lowValueCore = lowValueCoreCards(cards);
    lowValueCore.forEach((card) => failures.push(`low-value topic appears in core lane ${card.lane}: ${card.id}`));

    const lowRelevanceCore = lowRelevanceCoreCards(cards);
    lowRelevanceCore.forEach((card) => failures.push(`low-relevance item appears in core lane ${card.lane}: ${card.id}`));

    const repeatedParagraphs = repeatedParagraphFingerprints(pages);
    repeatedParagraphs.forEach((repeat) => failures.push(`paragraph repeats between ${repeat.first.url} and ${repeat.second.url}`));

    const quarantinedInSitemap = quarantinedIds().filter((id) => sitemap.includes(`/news/${id}/`));
    quarantinedInSitemap.forEach((id) => failures.push(`quarantined/archive-only item appears in sitemap: ${id}`));
    const quarantinedOnHomepage = quarantinedIds().filter((id) => homeHtml.includes(`data-article-id="${id}"`));
    quarantinedOnHomepage.forEach((id) => failures.push(`quarantined/archive-only item appears on homepage: ${id}`));
    const quarantinedInRss = quarantinedIds().filter((id) => rss.includes(`/news/${id}/`));
    quarantinedInRss.forEach((id) => failures.push(`quarantined/archive-only item appears in RSS: ${id}`));

    const report = [
      '# Public Content Quality Audit Report',
      '',
      `Generated at: ${new Date().toISOString()}`,
      `Base URL: ${resolvedBaseUrl}`,
      `Homepage cards checked: ${cards.length}`,
      `Detail pages checked: ${pages.length}`,
      '',
      '## Counts',
      '',
      `- Direct blocked string matches: ${directMatches}`,
      `- Template phrase matches: ${templateMatches}`,
      `- Boilerplate matches: ${boilerplateMatches}`,
      `- Truncation matches: ${truncationMatches}`,
      `- Duplicate homepage deck prefixes: ${duplicateDeckPrefixes.length}`,
      `- Low-value core-lane violations: ${lowValueCore.length}`,
      `- Low-relevance core-lane violations: ${lowRelevanceCore.length}`,
      `- Repeated paragraph fingerprints: ${repeatedParagraphs.length}`,
      `- Quarantined/archive-only sitemap leaks: ${quarantinedInSitemap.length}`,
      `- Quarantined/archive-only RSS leaks: ${quarantinedInRss.length}`,
      '',
      '## Failures',
      '',
      ...(failures.length ? failures.map((failure) => `- ${failure}`) : ['- None']),
      '',
      '## Checked Detail URLs',
      '',
      ...(pages.length ? pages.map((page) => `- ${page.url}`) : ['- None']),
    ].join('\n');
    await fs.mkdir(path.dirname(REPORT_PATH), { recursive: true });
    await fs.writeFile(REPORT_PATH, `${report}\n`, 'utf8');

    if (failures.length) {
      throw new Error(`content quality audit failed with ${failures.length} issue(s). See docs/public-content-quality-audit-report.md`);
    }
    console.log(`content quality audit passed for ${cards.length} homepage cards and ${pages.length} detail pages`);
    return { ok: true, cards, pages, failures };
  } finally {
    if (server) await server.close();
  }
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] || '')) {
  await runContentQualityAudit();
}
