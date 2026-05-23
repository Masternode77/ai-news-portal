const ADAPTERS = [
  { pattern: /datacenterdynamics\.com/i, adapter: 'rss_plus_article_jsonld' },
  { pattern: /uptimeinstitute\.com/i, adapter: 'rss_plus_readability' },
  { pattern: /hpcwire\.com/i, adapter: 'rss_plus_readability' },
  { pattern: /insidehpc\.com/i, adapter: 'rss_plus_readability' },
  { pattern: /blocksandfiles\.com/i, adapter: 'rss_plus_readability' },
  { pattern: /siliconangle\.com/i, adapter: 'rss_plus_readability' },
  { pattern: /theregister\.com/i, adapter: 'atom_plus_article_body' },
  { pattern: /utilitydive\.com/i, adapter: 'rss_plus_article_jsonld' },
  { pattern: /power-eng\.com/i, adapter: 'rss_plus_readability' },
  { pattern: /capacitymedia\.com/i, adapter: 'rss_plus_readability' },
];

export function sourceAdapterFor(source = {}) {
  const text = [source.domain, source.url, source.feed, source.source, source.name].filter(Boolean).join(' ');
  return ADAPTERS.find((entry) => entry.pattern.test(text))?.adapter || 'generic_feed_adapter';
}
