const VOICES = [
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

export function selectAutonomousVoice(cluster = {}, options = {}) {
  const recent = options.recent || [];
  const used = new Map();
  for (const item of recent) used.set(item.blog_metadata?.tone || item.voice, (used.get(item.blog_metadata?.tone || item.voice) || 0) + 1);
  const text = [cluster.cluster_title, cluster.primary_infrastructure_layer, cluster.cluster_topic].join(' ');
  const preferred = /capital|reit|ipo|finance/i.test(text)
    ? 'Deal memo writer'
    : /power|grid|permit|siting|regulation/i.test(text)
      ? 'Policy risk analyst'
      : /semiconductor|memory|gpu|network|storage|platform/i.test(text)
        ? 'Technical explainer'
        : 'Board-level strategist';
  if ((used.get(preferred) || 0) < 3) return preferred;
  return VOICES.find((voice) => (used.get(voice) || 0) < 3) || VOICES[recent.length % VOICES.length];
}

export { VOICES as AUTONOMOUS_VOICES };
