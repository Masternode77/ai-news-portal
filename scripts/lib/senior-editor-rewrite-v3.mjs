import { guardPublicCopy } from './copy-quality-guard.mjs';

const REPLACEMENTS = [
  [/Compute Current readers, the useful question is/gi, 'For Compute Current readers, the question is'],
  [/\bFor For Compute Current readers\b/gi, 'For Compute Current readers'],
  [/\bthe useful read is\b/gi, 'The sharper read is'],
  [/\bheadline\b/gi, 'reported item'],
  [/\bannouncement volume\b/gi, 'announcement cadence'],
  [/\bevidence\b/gi, 'proof'],
];

function cleanBlock(block = '') {
  let text = String(block || '').replace(/\s+/g, ' ').trim();
  for (const [pattern, replacement] of REPLACEMENTS) text = text.replace(pattern, replacement);
  return text;
}

export function seniorEditorRewriteV3(article = {}) {
  const body = String(article.article_body_markdown || article.articleText || '')
    .split(/\n{2,}/)
    .map(cleanBlock)
    .filter(Boolean)
    .filter((block) => guardPublicCopy(block).ok)
    .join('\n\n');

  return {
    ...article,
    article_body_markdown: body,
    articleText: body,
    contentText: body,
    fullArticleText: body,
    expertLensFull: {
      finalArticleBody: body,
      bottomLine: article.bottom_line || '',
      atAGlance: article.at_a_glance || [],
      watchMetrics: article.what_to_watch || [],
    },
  };
}
