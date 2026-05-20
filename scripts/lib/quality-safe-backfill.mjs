import { buildEditorialArticleV3 } from './editorial-article-engine-v3.mjs';
import { buildEditorialCandidatePool } from './editorial-candidate-pool.mjs';

function isLocal(article = {}) {
  return article.articlePagePublished !== false
    && article.homepagePublished !== false
    && article.archiveOnly !== true
    && article.noindex !== true
    && article.public_status !== 'quarantined';
}

function isFull(article = {}) {
  return isLocal(article) && /Core Longform Blog|Standard Blog/i.test(article.public_route || '');
}

function publishableSourceCard(article = {}) {
  return {
    ...article,
    public_route: 'Source Card',
    public_signal_label: 'Source Watch',
    editorial_lens: 'Source Watch',
    articlePagePublished: false,
    signalCardOnly: true,
    homepagePublished: true,
    archiveOnly: false,
    noindex: true,
    seo_noindex: true,
    public_status: 'source_card',
  };
}

export function qualitySafeBackfill(items = [], options = {}) {
  const pool = buildEditorialCandidatePool(items, options);
  const targetVisible = Number(options.targetVisible || 20);
  const targetLocal = Number(options.targetLocal || 12);
  const targetFull = Number(options.targetFull || 6);
  const generated = [];
  const failures = [];
  const recent = [];

  for (const candidate of pool.candidates) {
    if (generated.length >= Math.max(targetVisible, targetLocal)) break;
    const result = buildEditorialArticleV3(candidate.article, {
      index: generated.length,
      recent,
    });
    if (result.ok && isLocal(result.article)) {
      generated.push(result.article);
      recent.push(result.article);
    } else {
      failures.push({
        id: candidate.article.id,
        title: candidate.article.title,
        reasons: result.reasons || result.gate?.reasons || ['generation_failed'],
      });
    }
  }

  const sourceCards = [];
  if (generated.length < targetVisible) {
    for (const rejected of pool.rejected) {
      if (sourceCards.length + generated.length >= targetVisible) break;
      if (!/low_infrastructure_relevance|dirty_extraction_or_boilerplate|truncation|copyright/i.test(rejected.reason)) {
        sourceCards.push(publishableSourceCard(rejected.article));
      }
    }
  }

  const visible = [...generated, ...sourceCards].slice(0, targetVisible);
  const localCount = visible.filter(isLocal).length;
  const fullCount = visible.filter(isFull).length;
  const sourceCardCount = visible.length - localCount;

  return {
    pool,
    generated,
    sourceCards,
    visible,
    failures,
    targets: { targetVisible, targetLocal, targetFull },
    counts: {
      visible: visible.length,
      local: localCount,
      full: fullCount,
      source_cards: sourceCardCount,
      quarantined: failures.length + pool.rejected.length,
    },
    meetsTargets: visible.length >= targetVisible
      && localCount >= targetLocal
      && fullCount >= targetFull
      && sourceCardCount / Math.max(visible.length, 1) <= 0.3,
  };
}
