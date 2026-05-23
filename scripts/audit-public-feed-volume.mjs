import latestNews from '../src/data/latest-news.json' with { type: 'json' };
import archivedNews from '../src/data/archived-news.json' with { type: 'json' };
import { buildHomepageFeed, publicHomepageFeedEligible } from './lib/homepage-feed-builder.mjs';

export function auditPublicFeedVolume() {
  const all = [...latestNews, ...archivedNews];
  const eligible = all.filter(publicHomepageFeedEligible);
  const feed = buildHomepageFeed(all, { limit: 50, minimumVisible: 30 });
  const longformCount = feed.items.filter((article) => article.articlePagePublished === true && article.public_content_tier !== 'editorial_brief' && article.public_content_tier !== 'signal_card').length;
  const shortCount = feed.items.filter((article) => article.public_content_tier === 'editorial_brief' || article.public_content_tier === 'signal_card' || article.signalCardOnly === true).length;
  const reasons = [];
  if (eligible.length >= 20 && feed.items.length < 20) reasons.push('public_card_count_below_20');
  if (longformCount < 10) reasons.push('longform_count_below_10');
  if (shortCount < 10) reasons.push('short_signal_count_below_10');
  return {
    ok: reasons.length === 0,
    reasons,
    eligibleCount: eligible.length,
    homepageCount: feed.items.length,
    longformCount,
    shortCount,
  };
}

const result = auditPublicFeedVolume();
if (!result.ok) {
  console.error(`feed volume audit failed: ${result.reasons.join(', ')}`);
  process.exitCode = 1;
} else {
  console.log(`feed volume audit passed: ${result.homepageCount} homepage cards, ${result.longformCount} longform, ${result.shortCount} short`);
}
