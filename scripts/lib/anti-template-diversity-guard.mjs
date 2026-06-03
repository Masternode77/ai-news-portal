import { headingSequence, visibleBodyText } from './visible-body-length.mjs';

function firstWords(text = '', count = 10) {
  return visibleBodyText(text).split(/\s+/).slice(0, count).join(' ').toLowerCase();
}

function cardOpeningText(article = {}) {
  return article.public_presentation?.deck
    || article.publicSignal?.deck
    || article.deck
    || article.summary
    || article.snippet
    || article.title
    || '';
}

function longformOpeningText(article = {}) {
  return article.expertLensFull?.finalArticleBody || article.body || '';
}

function duplicateKeys(rows = [], field) {
  const seen = new Map();
  const repeats = [];
  for (const row of rows) {
    const key = row[field];
    if (!key) continue;
    if (seen.has(key)) repeats.push({ key, first: seen.get(key), second: row.id });
    else seen.set(key, row.id);
  }
  return repeats;
}

export function recentOpeningInventory(articles = [], options = {}) {
  const limit = options.limit || 30;
  return articles.slice(0, limit).map((article) => ({
    id: article.id,
    cardOpening8: firstWords(cardOpeningText(article), 8),
    longformOpening12: firstWords(longformOpeningText(article), 12),
  }));
}

export function latestOpeningDiversityResult(articles = [], options = {}) {
  const inventory = recentOpeningInventory(articles, options);
  const duplicateCardOpenings = duplicateKeys(inventory, 'cardOpening8');
  const duplicateLongformOpenings = duplicateKeys(inventory, 'longformOpening12');
  const reasons = [];
  if (duplicateCardOpenings.length) reasons.push('duplicate_card_opening_first_8_words');
  if (duplicateLongformOpenings.length) reasons.push('duplicate_longform_opening_first_12_words');
  return {
    ok: reasons.length === 0,
    inventory,
    duplicateCardOpenings,
    duplicateLongformOpenings,
    reasons,
  };
}

export function antiTemplateDiversityResult(article = {}, recent = []) {
  const body = article.expertLensFull?.finalArticleBody || article.body || '';
  const opening = firstWords(body, 10);
  const cardOpening8 = firstWords(cardOpeningText(article), 8);
  const longformOpening12 = firstWords(body, 12);
  const recentInventory = recentOpeningInventory(recent);
  const sequence = headingSequence(body).join(' > ');
  const duplicateOpening = recent.some((item) => firstWords(item.expertLensFull?.finalArticleBody || item.body || '', 10) === opening);
  const duplicateCardOpening = recentInventory.some((item) => item.cardOpening8 && item.cardOpening8 === cardOpening8);
  const duplicateLongformOpening = recentInventory.some((item) => item.longformOpening12 && item.longformOpening12 === longformOpening12);
  const sameSequenceCount = recent.filter((item) => headingSequence(item.expertLensFull?.finalArticleBody || item.body || '').join(' > ') === sequence).length;
  const reasons = [];
  if (duplicateOpening) reasons.push('duplicate_opening_first_10_words');
  if (duplicateCardOpening) reasons.push('duplicate_card_opening_first_8_words');
  if (duplicateLongformOpening) reasons.push('duplicate_longform_opening_first_12_words');
  if (sameSequenceCount > 1) reasons.push('heading_sequence_repeated_more_than_twice');
  return {
    ok: reasons.length === 0,
    opening,
    cardOpening8,
    longformOpening12,
    recentOpeningInventory: recentInventory,
    headingSequence: sequence,
    reasons,
  };
}
