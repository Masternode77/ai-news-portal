import { visibleBodyText } from './visible-body-length.mjs';

export function repeatedParagraphs(text = '') {
  const seen = new Map();
  const repeats = [];
  for (const paragraph of String(text || '').split(/\n{2,}/).map(visibleBodyText).filter((line) => line.length > 80)) {
    const key = paragraph.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
    if (seen.has(key)) repeats.push(paragraph);
    else seen.set(key, paragraph);
  }
  return repeats;
}

export function repeatedOpeningKeys(articles = [], count = 10) {
  const seen = new Map();
  const repeats = [];
  for (const article of articles) {
    const key = visibleBodyText(article.expertLensFull?.finalArticleBody || '').toLowerCase().split(/\s+/).slice(0, count).join(' ');
    if (!key) continue;
    if (seen.has(key)) repeats.push({ key, first: seen.get(key), second: article.id });
    else seen.set(key, article.id);
  }
  return repeats;
}
