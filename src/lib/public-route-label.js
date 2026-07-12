function visibleWordCount(article = {}) {
  const body = article.expertLensFull?.finalArticleBody
    || article.articleBody
    || article.articleText
    || article.content
    || '';
  return String(body).trim().split(/\s+/).filter(Boolean).length;
}

export function publicFormatLabel(article = {}) {
  const tier = String(article.public_content_tier || '').trim().toLowerCase();

  if (tier === 'longform_analysis') {
    return visibleWordCount(article) >= 1_200 ? 'Deep Dive' : 'Analyst Note';
  }

  if (tier === 'editorial_brief') return 'Editorial Brief';
  return 'Source Brief';
}

export { visibleWordCount };
