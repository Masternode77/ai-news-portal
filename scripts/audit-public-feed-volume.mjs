import latestNews from '../src/data/latest-news.json' with { type: 'json' };
import archivedNews from '../src/data/archived-news.json' with { type: 'json' };
import { pathToFileURL } from 'node:url';
import { buildHomepageFeed, publicHomepageFeedEligible } from './lib/homepage-feed-builder.mjs';
import { isPublicLongformArticle } from './lib/public-surface-eligibility.mjs';
import {
  collectRightsReviewSafeModeEvidence,
  rightsReviewSafeModeResult,
} from './lib/rights-review-safe-mode.mjs';

export function publicFeedVolumeResult(all = [...latestNews, ...archivedNews], options = {}) {
  const eligible = all.filter((article) => publicHomepageFeedEligible(article, options));
  const feed = buildHomepageFeed(all, { ...options, limit: 50, minimumVisible: 30 });
  const qualityLongformCount = all.filter((article) => isPublicLongformArticle(article, options)).length;
  const targetLongformCount = Math.min(10, qualityLongformCount);
  const longformCount = feed.items.filter((article) => isPublicLongformArticle(article, options)).length;
  const shortCount = feed.items.filter((article) => article.public_content_tier === 'editorial_brief' || article.public_content_tier === 'signal_card' || article.signalCardOnly === true).length;
  const normalReasons = [];
  if (eligible.length >= 20 && feed.items.length < 20) normalReasons.push('public_card_count_below_20');
  if (longformCount < targetLongformCount) normalReasons.push(`longform_count_below_quality_pool:${longformCount}/${targetLongformCount}`);
  if (shortCount < 10) normalReasons.push('short_signal_count_below_10');
  const suppliedEvidence = options.safeModeEvidence;
  const safeModeEvidence = suppliedEvidence ? {
    ...suppliedEvidence,
    publicCardCount: Math.max(suppliedEvidence.publicCardCount ?? -1, feed.items.length),
    publicDetailCount: Math.max(suppliedEvidence.publicDetailCount ?? -1, longformCount),
  } : null;
  const safeMode = safeModeEvidence ? rightsReviewSafeModeResult(safeModeEvidence) : null;
  const safeModeCandidate = safeModeEvidence?.authorizedSourceCount === 0;
  const reasons = safeMode?.ok
    ? []
    : [...normalReasons, ...(safeModeCandidate ? safeMode.reasons : [])];
  return {
    ok: reasons.length === 0,
    mode: safeMode?.ok ? safeMode.mode : 'normal',
    reasons,
    eligibleCount: eligible.length,
    homepageCount: feed.items.length,
    longformCount,
    qualityLongformCount,
    targetLongformCount,
    shortCount,
    safeModeEvidence,
  };
}

export function auditPublicFeedVolume({
  all = [...latestNews, ...archivedNews],
  eligibilityOptions = {},
  safeModeEvidence = collectRightsReviewSafeModeEvidence({
    sourceRegistry: eligibilityOptions.sourceRegistry,
    now: eligibilityOptions.now,
  }),
} = {}) {
  return publicFeedVolumeResult(all, { ...eligibilityOptions, safeModeEvidence });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = auditPublicFeedVolume();
  if (!result.ok) {
    console.error(`feed volume audit failed: ${result.reasons.join(', ')}`);
    process.exitCode = 1;
  } else {
    console.log(result.mode === 'rights_review_safe_mode'
      ? 'feed volume audit passed: rights_review_safe_mode'
      : `feed volume audit passed: ${result.homepageCount} homepage cards, ${result.longformCount}/${result.targetLongformCount} quality longform, ${result.shortCount} short`);
  }
}
