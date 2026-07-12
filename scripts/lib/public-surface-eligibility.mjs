import { safeSourceUrlFor, shouldNoindexArticle } from '../../src/lib/seo-safeguards.js';
import { articleDetailQualityEligible } from './article-detail-quality-gate.mjs';
import { longformQualityResult } from './longform-engine.mjs';
import {
  PUBLIC_ARTICLE_TIERS,
  isRssEligible,
  isSitemapEligible,
  publicArticleContract,
} from './public-article-contract.mjs';

function persistedEditorialGatesPass(article = {}) {
  return article.repetition_blocked !== true
    && article.source_fidelity?.ok === true
    && article.claim_fidelity?.ok === true
    && (article.claim_fidelity?.unsupportedClaims?.length || 0) === 0
    && article.seo_fidelity?.ok === true;
}

function strictLocalLongformEligible(article = {}, contract = publicArticleContract(article)) {
  return Boolean(
    article?.id
      && isSitemapEligible(contract)
      && article.archiveOnly !== true
      && !shouldNoindexArticle(article)
      && articleDetailQualityEligible(article)
      && longformQualityResult(article).ok
      && persistedEditorialGatesPass(article)
  );
}

export function publicSurfaceDecision(article = {}) {
  const contract = publicArticleContract(article);
  const sourceHref = safeSourceUrlFor(article);
  const detailPage = strictLocalLongformEligible(article, contract);
  const failedLongform = contract.tier === PUBLIC_ARTICLE_TIERS.LONGFORM_ANALYSIS && !detailPage;
  const hasPublicDestination = !failedLongform && (detailPage || Boolean(sourceHref));
  const archive = hasPublicDestination
    && contract.status === 'published'
    && contract.visibility.public === true
    && contract.visibility.noindex !== true
    && article.archiveOnly !== true;
  const homepage = hasPublicDestination
    && contract.status === 'published'
    && contract.visibility.homepage === true
    && contract.visibility.noindex !== true
    && article.archiveOnly !== true;
  return {
    contract,
    archive,
    detailPage,
    homepage,
    sourceHref,
    rss: homepage && isRssEligible(contract),
  };
}

export function isPublicLongformArticle(article = {}) {
  return publicSurfaceDecision(article).detailPage;
}

export function isPublicHomepageArticle(article = {}) {
  return publicSurfaceDecision(article).homepage;
}

export function isPublicArchiveArticle(article = {}) {
  return publicSurfaceDecision(article).archive;
}

export function isPublicRssArticle(article = {}) {
  return publicSurfaceDecision(article).rss;
}
