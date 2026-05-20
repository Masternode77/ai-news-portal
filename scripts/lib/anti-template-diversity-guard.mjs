import { headingSequence, visibleBodyText } from './visible-body-length.mjs';

function firstWords(text = '', count = 10) {
  return visibleBodyText(text).split(/\s+/).slice(0, count).join(' ').toLowerCase();
}

export function antiTemplateDiversityResult(article = {}, recent = []) {
  const body = article.expertLensFull?.finalArticleBody || article.body || '';
  const opening = firstWords(body, 10);
  const sequence = headingSequence(body).join(' > ');
  const duplicateOpening = recent.some((item) => firstWords(item.expertLensFull?.finalArticleBody || item.body || '', 10) === opening);
  const sameSequenceCount = recent.filter((item) => headingSequence(item.expertLensFull?.finalArticleBody || item.body || '').join(' > ') === sequence).length;
  const reasons = [];
  if (duplicateOpening) reasons.push('duplicate_opening_first_10_words');
  if (sameSequenceCount > 1) reasons.push('heading_sequence_repeated_more_than_twice');
  return {
    ok: reasons.length === 0,
    opening,
    headingSequence: sequence,
    reasons,
  };
}
