// Presentation builders for The Current. Columns render through their own
// small surface layer instead of the source-derived card machinery, with a
// render-time banned-language re-check as belt and braces.
import { bannedPhraseMatches } from './banned-phrases.mjs';
import { hasInternalPublicLanguage } from './internal-language-guard.mjs';
import { authoredColumnPublicEligible } from './authored-column-policy.mjs';
import { stripHtml, truncate } from './normalize.mjs';

function cleanLine(value = '', limit = 300) {
  return truncate(stripHtml(String(value || '')).replace(/\s+/g, ' ').trim(), limit);
}

function renderSafe(column = {}) {
  const text = [column.title, column.deck, column.summary].filter(Boolean).join(' ');
  return !bannedPhraseMatches(text).length && !hasInternalPublicLanguage(text);
}

export function columnPath(column = {}) {
  return `/column/${column.slug}/`;
}

export function publishedColumns(columns = []) {
  return columns
    .filter((column) => authoredColumnPublicEligible(column))
    .filter(renderSafe)
    .sort((a, b) => new Date(b.publishedAt || 0).getTime() - new Date(a.publishedAt || 0).getTime());
}

export function latestPublishedColumn(columns = []) {
  return publishedColumns(columns)[0] || null;
}

export function buildColumnCards(columns = []) {
  return publishedColumns(columns).map((column) => ({
    id: column.id,
    label: 'Column',
    title: cleanLine(column.title, 120),
    deck: cleanLine(column.deck, 260),
    byline: column.author?.name || 'The Current',
    role: column.author?.role || '',
    date: column.publishedAt || '',
    href: columnPath(column),
    image: column.heroImage || column.generatedImage || '/generated/fallbacks/ai-infrastructure.svg',
    imageAlt: column.imageAlt || `${cleanLine(column.title, 90)} illustration`,
    category: column.primary_category || column.category || 'AI Infrastructure',
    thesis: cleanLine(column.stance?.thesis || '', 220),
  }));
}

export function buildColumnRssItems(columns = [], siteUrl = 'https://www.computecurrent.com') {
  return publishedColumns(columns).map((column) => ({
    title: cleanLine(column.title, 140),
    description: cleanLine(column.deck || column.summary || '', 300),
    link: `${siteUrl}${columnPath(column)}`,
    pubDate: column.publishedAt ? new Date(column.publishedAt) : undefined,
    categories: [column.primary_category || column.category].filter(Boolean),
  }));
}

export function buildColumnSitemapEntries(columns = [], siteUrl = 'https://www.computecurrent.com') {
  const items = publishedColumns(columns);
  const entries = items.map((column) => ({
    loc: `${siteUrl}${columnPath(column)}`,
    lastmod: column.updatedAt || column.publishedAt || undefined,
  }));
  if (items.length) {
    entries.unshift({ loc: `${siteUrl}/column/`, lastmod: items[0].publishedAt || undefined });
  }
  return entries;
}
