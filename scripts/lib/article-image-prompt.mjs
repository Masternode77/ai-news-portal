function clean(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function list(values = []) {
  if (!Array.isArray(values)) return clean(values);
  return values.map(clean).filter(Boolean).slice(0, 6).join(', ');
}

function first(...values) {
  return values.map(clean).find(Boolean) || '';
}

export function articleImageAltText(article = {}) {
  const title = first(article.expertLensFull?.finalHeadline, article.title);
  return title ? `Editorial image for ${title}` : 'Compute Current editorial image';
}

export function buildArticleImagePrompt(article = {}) {
  const title = first(article.expertLensFull?.finalHeadline, article.title, 'AI infrastructure briefing');
  const category = first(
    article.publicSignal?.category,
    article.public_presentation?.category,
    article.primary_category,
    article.category,
    'AI infrastructure'
  );
  const layer = first(article.infrastructure_layer, article.layer, article.topic, category);
  const entities = list(article.named_entities || article.entities || article.companies || article.mentionedCompanies);
  const archetype = first(article.story_archetype, article.public_routing?.story_archetype, article.archetype, 'infrastructure analysis');
  const region = first(article.region, article.country, 'Global');
  const tone = first(article.editorial_tone, article.tone, 'premium infrastructure intelligence');
  const context = first(
    article.publicSignal?.deck,
    article.deck,
    article.summary,
    article.snippet,
    article.articleText,
    title
  ).slice(0, 1000);

  return [
    'Use case: Compute Current public article image.',
    `Title: ${title}`,
    `Category: ${category}`,
    `Infrastructure layer: ${layer}`,
    entities ? `Named entities to evoke, without logos: ${entities}` : '',
    `Story archetype: ${archetype}`,
    `Region: ${region}`,
    `Tone: ${tone}`,
    `Context: ${context}`,
    'Composition: original editorial infrastructure image, realistic depth, wide hero crop, clear subject, enough negative space for card and OpenGraph crops.',
    'Visual vocabulary: data center halls, substations, transformers, grid interconnects, cooling loops, semiconductor packages, cloud capacity signals, financing pressure, or siting constraints when relevant.',
    'Constraints: no logos, no brand marks, no readable text, no watermarks, no stock-photo people, no decorative bokeh, no generic purple gradient.',
  ].filter(Boolean).join('\n');
}

export function imageSlugPart(value = '') {
  return clean(value)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90);
}
