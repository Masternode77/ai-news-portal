import { buildPublicPresentation } from './public-presentation.mjs';
import { applySourceScopePolicy } from './source-scope-policy.mjs';

function compact(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function sourceDomain(url = '') {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function cleanBody(value = '') {
  return String(value || '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function finalPublicArticleModelV3(article = {}, angle = {}, gate = {}) {
  const scoped = applySourceScopePolicy({
    ...article,
    public_route: angle.route || article.public_route,
    public_signal_label: angle.public_signal_label || article.public_signal_label,
    editorial_lens: angle.editorial_lens || article.editorial_lens,
    primary_category: angle.category || article.primary_category,
    category: angle.category || article.category,
  }, article.public_routing || {});
  const sourceUrl = scoped.sourceUrl || scoped.url || '';
  const route = scoped.public_route || angle.route;
  const localArticle = !/Short Signal|Source Card/i.test(route);
  const presentation = buildPublicPresentation(scoped, {
    route: scoped.public_routing || {
      visibility: localArticle ? 'core' : 'adjacent',
      laneKey: localArticle ? 'local-analysis' : 'source-watch',
      laneTitle: route,
      routing_decision: route,
      public_signal_label: scoped.public_signal_label,
      editorial_lens: scoped.editorial_lens,
      story_archetype: scoped.editorial_lens,
    },
  });

  const sourceAttribution = {
    name: compact(scoped.source || 'Source'),
    url: sourceUrl,
    domain: sourceDomain(sourceUrl),
  };

  return {
    id: scoped.id,
    slug: scoped.slug || scoped.id,
    title: compact(scoped.title),
    deck: compact(scoped.deck || scoped.summary || scoped.snippet),
    byline: 'By Compute Current Editorial Desk',
    source_attribution: sourceAttribution,
    at_a_glance: (scoped.at_a_glance || []).slice(0, 3),
    article_body_markdown: cleanBody(scoped.article_body_markdown),
    what_to_watch: (scoped.what_to_watch || []).slice(0, 4),
    bottom_line: compact(scoped.bottom_line),
    public_route: route,
    public_signal_label: scoped.public_signal_label || route,
    editorial_lens: scoped.editorial_lens || angle.editorial_lens,
    category: scoped.primary_category || scoped.category,
    region: scoped.region || 'Global',
    tags: scoped.tags || [],
    source_url: sourceUrl,
    canonical_url: `https://www.computecurrent.com/news/${scoped.id}/`,
    ai_disclosure: 'AI-assisted extraction, classification, drafting, and quality gates were used. The linked source remains the authoritative record.',
    public_presentation: presentation,
    quality_scores: gate.metrics || scoped.quality_scores || {},
  };
}
