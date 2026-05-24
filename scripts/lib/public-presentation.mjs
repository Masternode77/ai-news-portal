import { generateEditorialExcerpt } from './editorial-excerpt-generator.mjs';
import { guardPublicCopy } from './copy-quality-guard.mjs';
import { generateCardCopy } from './card-copy-quality-gate.mjs';
import { normalizeProperNouns } from './proper-noun-normalizer.mjs';
import { routePublicLane } from './public-lane-router.mjs';
import { articleDisplayImage, articleImageAlt } from './article-image-surface.mjs';

const FALLBACK_READER_IMPACT = ['Operators', 'Capacity planners'];

function compact(value = '') {
  return normalizeProperNouns(String(value || '').replace(/\s+/g, ' ').trim());
}

function stakeholderLabels(article = {}) {
  const values = Array.isArray(article.affected_stakeholders)
    ? article.affected_stakeholders
    : [];
  const normalized = values
    .map((value) => compact(value).replace(/\b\w/g, (char) => char.toUpperCase()))
    .filter(Boolean)
    .slice(0, 4);
  return normalized.length ? normalized : FALLBACK_READER_IMPACT;
}

function publicImage(article = {}) {
  return articleDisplayImage(article);
}

function normalizedRoute(article = {}, route = undefined) {
  const fallback = routePublicLane(article);
  const tierLabel = article.public_content_tier === 'longform_analysis'
    ? 'Analysis'
    : article.public_content_tier === 'editorial_brief'
      ? 'Brief'
      : article.public_content_tier === 'signal_card'
        ? 'Signal'
        : '';
  return {
    ...fallback,
    ...(route || {}),
    public_signal_label: tierLabel || route?.public_signal_label || fallback.public_signal_label || 'Brief',
    editorial_lens: route?.editorial_lens || fallback.editorial_lens || 'Infrastructure Signal',
    laneKey: route?.laneKey || fallback.laneKey || 'adjacent-watchlist',
    laneTitle: route?.laneTitle || fallback.laneTitle || 'Active Watchlist',
    visibility: route?.visibility || fallback.visibility || 'adjacent',
    story_archetype: route?.story_archetype || fallback.story_archetype || 'Adjacent Signal',
  };
}

export function publicDetailHref(article = {}) {
  const sourceUrl = article.sourceUrl || article.url || '';
  if (article.articlePagePublished === false || article.archiveOnly === true || article.signalCardOnly === true || article.public_content_tier === 'editorial_brief' || article.public_content_tier === 'signal_card') {
    return '';
  }
  return article.id ? `/news/${article.id}/` : '';
}

export function buildPublicPresentation(article = {}, options = {}) {
  const route = normalizedRoute(article, options.route || article.public_routing);
  const persisted = article.public_presentation || {};
  const generated = generateEditorialExcerpt(article, {
    route,
    recentDecks: options.recentDecks || [],
  });
  const cardCopy = generateCardCopy(article);
  const title = compact(article.expertLensFull?.finalHeadline || article.title || '');
  const deck = guardPublicCopy(cardCopy.deck || article.deck || persisted.deck || generated.deck).text;
  const why = guardPublicCopy(cardCopy.why_it_matters || article.why_it_matters || persisted.why_it_matters || generated.why_it_matters).text;
  const detailHref = publicDetailHref(article);
  const image = publicImage(article);

  return {
    id: article.id || persisted.id,
    signal_label: route.public_signal_label || persisted.signal_label,
    editorial_lens: route.editorial_lens || persisted.editorial_lens,
    title,
    deck,
    why_it_matters: why,
    image,
    image_alt: persisted.image_alt || articleImageAlt({ ...article, title }),
    reader_impact: persisted.reader_impact || stakeholderLabels(article),
    region: compact(article.region || 'Global'),
    source: compact(article.source || 'Source'),
    view_detail: detailHref,
    read_source: article.sourceUrl || article.url || '',
    lane_key: route.laneKey || persisted.lane_key,
    lane_title: route.laneTitle || persisted.lane_title,
    visibility: route.visibility || persisted.visibility,
    story_archetype: route.story_archetype || persisted.story_archetype,
  };
}

export function withPublicPresentation(article = {}, options = {}) {
  const route = options.route || routePublicLane(article);
  const presentation = buildPublicPresentation(article, { ...options, route });
  return {
    ...article,
    public_presentation: presentation,
    public_routing: route,
    signal_label: presentation.signal_label,
    editorial_lens: presentation.editorial_lens,
    deck: presentation.deck,
    why_it_matters: presentation.why_it_matters,
  };
}
