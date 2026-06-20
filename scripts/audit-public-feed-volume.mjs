import latestNews from '../src/data/latest-news.json' with { type: 'json' };
import archivedNews from '../src/data/archived-news.json' with { type: 'json' };
import { buildHomepageFeed, publicHomepageFeedEligible } from './lib/homepage-feed-builder.mjs';
import { isPublicLongformArticle } from './lib/public-surface-eligibility.mjs';

export function publicFeedVolumeResult(all = [...latestNews, ...archivedNews]) {
  const eligible = all.filter(publicHomepageFeedEligible);
  const feed = buildHomepageFeed(all, { limit: 50, minimumVisible: 30 });
  const qualityLongformCount = all.filter(isPublicLongformArticle).length;
  const targetLongformCount = Math.min(10, qualityLongformCount);
  const longformCount = feed.items.filter(isPublicLongformArticle).length;
  const shortCount = feed.items.filter((article) => article.public_content_tier === 'editorial_brief' || article.public_content_tier === 'signal_card' || article.signalCardOnly === true).length;
  const reasons = [];
  if (eligible.length >= 20 && feed.items.length < 20) reasons.push('public_card_count_below_20');
  if (longformCount < targetLongformCount) reasons.push(`longform_count_below_quality_pool:${longformCount}/${targetLongformCount}`);
  if (shortCount < 10) reasons.push('short_signal_count_below_10');
  return {
    ok: reasons.length === 0,
    reasons,
    eligibleCount: eligible.length,
    homepageCount: feed.items.length,
    longformCount,
    qualityLongformCount,
    targetLongformCount,
    shortCount,
  };
}

export function auditPublicFeedVolume() {
  return publicFeedVolumeResult();
}

const result = auditPublicFeedVolume();
if (!result.ok) {
  console.error(`feed volume audit failed: ${result.reasons.join(', ')}`);
  process.exitCode = 1;
} else {
  console.log(`feed volume audit passed: ${result.homepageCount} homepage cards, ${result.longformCount}/${result.targetLongformCount} quality longform, ${result.shortCount} short`);
}
