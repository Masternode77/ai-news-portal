export const BLOG_TONES = [
  'Board-level strategist',
  'Infrastructure operator',
  'Investor analyst',
  'Technical explainer',
  'Skeptical columnist',
  'Market cartographer',
  'Procurement advisor',
  'Policy risk analyst',
  'Deal memo writer',
  'Field note reporter',
];

function toneHint(article = {}) {
  const text = [article.title, article.category, article.public_routing?.editorial_lens, article.infrastructure_layer].filter(Boolean).join(' ').toLowerCase();
  if (/power|grid|utility|siting|policy|moratorium|permit/.test(text)) return 'Policy risk analyst';
  if (/deal|capital|funding|financing|investor|kkr|stake/.test(text)) return 'Investor analyst';
  if (/memory|storage|network|platform|openshift|semiconductor|chip|gpu|hbm/.test(text)) return 'Technical explainer';
  if (/roundup|market map|land and expand/.test(text)) return 'Market cartographer';
  if (/cooling|operator|uptime|facility|capacity/.test(text)) return 'Infrastructure operator';
  return '';
}

export function toneDistribution(items = []) {
  const counts = new Map();
  for (const item of items) {
    const tone = typeof item === 'string' ? item : item.blog_metadata?.tone || item.tone;
    if (!tone) continue;
    counts.set(tone, (counts.get(tone) || 0) + 1);
  }
  return counts;
}

export function selectBlogTone(article = {}, options = {}) {
  const recent = options.recent || [];
  const counts = toneDistribution(recent);
  const preferred = toneHint(article);
  if (preferred && (counts.get(preferred) || 0) < 3) return preferred;
  const offset = Number(options.index || 0);
  for (let i = 0; i < BLOG_TONES.length; i += 1) {
    const tone = BLOG_TONES[(offset + i) % BLOG_TONES.length];
    if ((counts.get(tone) || 0) < 3) return tone;
  }
  return BLOG_TONES[offset % BLOG_TONES.length];
}
