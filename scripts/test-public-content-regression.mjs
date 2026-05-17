import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import latestNews from '../src/data/latest-news.json' with { type: 'json' };
import archivedNews from '../src/data/archived-news.json' with { type: 'json' };
import { BANNED_PHRASES, bannedPhraseMatches } from './lib/banned-phrases.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPORT_PATH = path.join(ROOT, 'docs/public-content-regression-report.md');
const BASE_URL = (process.env.PUBLIC_CONTENT_BASE_URL || 'https://www.computecurrent.com').replace(/\/$/, '');
const ARTICLE_LIMIT = Number(process.env.PUBLIC_CONTENT_ARTICLE_LIMIT || 30);

const BOILERPLATE_PATTERNS = [
  /\bcopyright\b/i,
  /\ball rights reserved\b/i,
  /\bprivacy policy\b/i,
  /\bterms of use\b/i,
  /\blegal notice\b/i,
  /\bsite feedback\b/i,
  /\btake our survey\b/i,
  /\bgift this article\b/i,
];

const ARTICLE_BY_ID = new Map([...latestNews, ...archivedNews].map((article) => [article.id, article]));

function decodeHtml(text = '') {
  return String(text)
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function stripHtml(html = '') {
  return decodeHtml(String(html).replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' '))
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

function articleCopy(html = '') {
  const section = html.match(/<section class="detail-section detail-article-copy">([\s\S]*?)<\/section>/i)?.[1] || html;
  return [...section.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((match) => stripHtml(match[1]))
    .filter(Boolean);
}

function firstWords(text = '', count = 12) {
  return stripHtml(text).toLowerCase().replace(/[^a-z0-9가-힣\s]/g, ' ').replace(/\s+/g, ' ').trim().split(/\s+/).slice(0, count).join(' ');
}

async function fetchText(url) {
  const response = await fetch(url);
  assert.ok(response.ok, `fetch failed ${response.status} ${url}`);
  return response.text();
}

async function main() {
  const failures = [];
  const homeHtml = await fetchText(`${BASE_URL}/`);
  const links = articleLinks(homeHtml);
  assert.ok(links.length, 'no article links found on homepage');

  const pages = [];
  for (const link of links) {
    const url = `${BASE_URL}${link.href}`;
    const html = await fetchText(url);
    pages.push({ ...link, url, html, text: stripHtml(html), paragraphs: articleCopy(html) });
  }

  for (const page of [{ id: 'homepage', url: `${BASE_URL}/`, text: stripHtml(homeHtml), html: homeHtml, paragraphs: [] }, ...pages]) {
    const matches = bannedPhraseMatches(page.text);
    if (Object.keys(matches).length) {
      failures.push(`${page.url} contains banned phrases: ${Object.keys(matches).join(', ')}`);
    }
    const boilerplate = BOILERPLATE_PATTERNS.filter((pattern) => pattern.test(page.text)).map((pattern) => pattern.source);
    if (boilerplate.length) {
      failures.push(`${page.url} contains source/legal boilerplate patterns: ${boilerplate.join(', ')}`);
    }
  }

  const hookStarts = new Map();
  const paragraphSeen = new Map();
  let editorsBriefCount = 0;
  let lowRelevanceFullCount = 0;

  for (const page of pages) {
    if (/Editor(?:'|&apos;|&#39;)s Brief/i.test(page.html)) editorsBriefCount += 1;
    const hookStart = firstWords(page.paragraphs[0] || '');
    if (hookStart) {
      if (hookStarts.has(hookStart)) {
        failures.push(`hook first 12 words repeat between ${hookStarts.get(hookStart)} and ${page.url}: ${hookStart}`);
      }
      hookStarts.set(hookStart, page.url);
    }

    for (const paragraph of page.paragraphs) {
      const normalized = firstWords(paragraph, 999);
      if (normalized.length < 80) continue;
      if (paragraphSeen.has(normalized)) {
        failures.push(`exact paragraph repeats between ${paragraphSeen.get(normalized)} and ${page.url}`);
      }
      paragraphSeen.set(normalized, page.url);
    }

    const record = ARTICLE_BY_ID.get(page.id);
    const score = Number(record?.infrastructure_relevance_score ?? record?.infrastructure_relevance?.infrastructure_relevance_score ?? 1);
    if (record && score < 0.75 && page.paragraphs.length >= 4) {
      lowRelevanceFullCount += 1;
      failures.push(`${page.url} is low relevance (${score.toFixed(2)}) but renders as a full article`);
    }
  }

  const editorsBriefRatio = pages.length ? editorsBriefCount / pages.length : 0;
  if (editorsBriefRatio > 0.4) {
    failures.push(`Editor's Brief appears in ${(editorsBriefRatio * 100).toFixed(1)}% of latest pages`);
  }

  const report = [
    '# Public Content Regression Report',
    '',
    `Generated at: ${new Date().toISOString()}`,
    `Base URL: ${BASE_URL}`,
    `Homepage article links checked: ${links.length}`,
    `Article pages fetched: ${pages.length}`,
    `Banned phrases configured: ${BANNED_PHRASES.length}`,
    `Editor's Brief count: ${editorsBriefCount}`,
    `Low-relevance full-article count: ${lowRelevanceFullCount}`,
    `Failures: ${failures.length}`,
    '',
    '## Checked URLs',
    `- ${BASE_URL}/`,
    ...pages.map((page) => `- ${page.url}`),
    '',
    '## Failure Details',
    ...(failures.length ? failures.map((failure) => `- ${failure}`) : ['- None']),
  ].join('\n');
  await fs.writeFile(REPORT_PATH, `${report}\n`, 'utf8');

  assert.deepEqual(failures, []);
  console.log(`public content regression passed for ${BASE_URL}`);
}

await main();
