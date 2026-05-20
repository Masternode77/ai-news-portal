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
  { pattern: /lightreading\.com/i, adapter: 'rss_plus_readability' },
  { pattern: /fierce-network\.com|fiercetelecom\.com/i, adapter: 'rss_plus_readability' },
  { pattern: /spectrum\.ieee\.org/i, adapter: 'rss_plus_article_jsonld' },
  { pattern: /reuters\.com|reutersagency\.com/i, adapter: 'rss_plus_summary_only' },
  { pattern: /amd\.com/i, adapter: 'rss_plus_article_jsonld' },
  { pattern: /intel\.com/i, adapter: 'rss_plus_article_jsonld' },
  { pattern: /se\.com|schneider-electric\.com/i, adapter: 'rss_plus_readability' },
  { pattern: /vertiv\.com/i, adapter: 'rss_plus_article_jsonld' },
];

export function sourceAdapterFor(source = {}) {
  const text = [source.domain, source.url, source.feed, source.source, source.name].filter(Boolean).join(' ');
  return ADAPTERS.find((entry) => entry.pattern.test(text))?.adapter || 'generic_feed_adapter';
}
