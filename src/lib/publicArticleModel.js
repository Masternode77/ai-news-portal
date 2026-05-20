import { cleanArticleBodyBlocks } from '../../scripts/lib/article-body-cleaner.mjs';
import { forbiddenPublicPhraseMatches, guardPublicCopy } from '../../scripts/lib/copy-quality-guard.mjs';
import { publicPublishQualityGate } from '../../scripts/lib/public-publish-quality-gate.mjs';
import { applySourceScopePolicy } from '../../scripts/lib/source-scope-policy.mjs';
import { cleanEditorialText, displayHeadline, executiveSummaryLines } from './editorial-display.js';
import { buildPublicPresentation } from './publicPresentation.js';
import { sourceAttributionFor } from './seo-safeguards.js';
import { taxonomyDisplay } from './taxonomy-display.js';

function cleanPublicText(value = '') {
  const guarded = guardPublicCopy(cleanEditorialText(value));
  return guarded.ok ? guarded.text : '';
}

function cleanPublicList(values = [], limit = 3) {
  return (Array.isArray(values) ? values : [])
    .map(cleanPublicText)
    .filter(Boolean)
    .filter((line) => !forbiddenPublicPhraseMatches(line).length)
    .slice(0, limit);
}

function bodySource(article = {}) {
  return article.article_body_markdown
    || article.expertLensFull?.finalArticleBody
    || article.fullArticleText
    || article.contentText
    || article.articleText
    || '';
}

export function buildPublicArticleModel(article = {}) {
  const scopedArticle = applySourceScopePolicy(article, article.public_routing || {});
  const quality = publicPublishQualityGate(scopedArticle);
  if (!quality.ok) {
    return {
      ok: false,
      article: scopedArticle,
      quality,
      reasons: quality.reasons,
    };
  }

  const lens = scopedArticle.expertLensFull || {};
  const publicPresentation = buildPublicPresentation(scopedArticle, {
    route: scopedArticle.public_routing,
  });
  const displayTitle = cleanPublicText(displayHeadline(scopedArticle));
  const deck = cleanPublicText(
    scopedArticle.deck
    || publicPresentation.deck
    || lens.metaDescription
    || scopedArticle.summary
    || scopedArticle.snippet
  );
  const sourceAttribution = sourceAttributionFor(scopedArticle);
  const taxonomy = taxonomyDisplay(scopedArticle);
  const articleBodyBlocks = cleanArticleBodyBlocks(bodySource(scopedArticle))
    .map(cleanPublicText)
    .filter(Boolean);
  const executiveSummary = cleanPublicList(executiveSummaryLines(scopedArticle), 3);
  const atAGlance = cleanPublicList(
    scopedArticle.at_a_glance
    || lens.atAGlance
    || executiveSummary,
    3
  );
  const whatToWatch = cleanPublicList(
    scopedArticle.what_to_watch
    || lens.watchMetrics
    || scopedArticle.evidence_pack?.watch_metrics
    || [],
    4
  );
  const bottomLine = cleanPublicText(
    scopedArticle.bottom_line
    || lens.bottomLine
    || scopedArticle.editorial_thesis?.bottom_line
    || scopedArticle.blog_metadata?.thesis
    || publicPresentation.why_it_matters
  );

  return {
    ok: true,
    article: scopedArticle,
    quality,
    title: displayTitle,
    deck,
    byline: 'By Compute Current Editorial Desk',
    sourceAttribution,
    taxonomy,
    publicPresentation: {
      ...publicPresentation,
      signal_label: scopedArticle.public_signal_label
        || scopedArticle.public_routing?.public_signal_label
        || publicPresentation.signal_label,
    },
    articleBodyBlocks,
    atAGlance,
    whatToWatch,
    bottomLine,
    public_route: scopedArticle.public_route || scopedArticle.public_routing?.routing_decision || '',
    public_signal_label: scopedArticle.public_signal_label || scopedArticle.public_routing?.public_signal_label || '',
    editorial_lens: scopedArticle.editorial_lens || scopedArticle.public_routing?.editorial_lens || '',
  };
}

export function publicArticleIsPublishable(article = {}) {
  return buildPublicArticleModel(article).ok;
}
