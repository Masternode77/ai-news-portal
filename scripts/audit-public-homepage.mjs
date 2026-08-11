import fs from 'node:fs';
import latestNews from '../src/data/latest-news.json' with { type: 'json' };
import archivedNews from '../src/data/archived-news.json' with { type: 'json' };
import { pathToFileURL } from 'node:url';
import { publicFeedVolumeResult } from './audit-public-feed-volume.mjs';
import { findInternalLanguageHits } from './lib/internal-language-guard.mjs';
import { buildHomepageFeed } from './lib/homepage-feed-builder.mjs';
import { isPublicProductFit } from './lib/public-product-fit.mjs';
import { collectRightsReviewSafeModeEvidence } from './lib/rights-review-safe-mode.mjs';

export function auditPublicHomepage({
  all = [...latestNews, ...archivedNews],
  source = fs.readFileSync('src/pages/index.astro', 'utf8'),
  eligibilityOptions = {},
  safeModeEvidence = collectRightsReviewSafeModeEvidence({
    sourceRegistry: eligibilityOptions.sourceRegistry,
    now: eligibilityOptions.now,
  }),
} = {}) {
  const volume = publicFeedVolumeResult(all, { ...eligibilityOptions, safeModeEvidence });
  const reasons = [...volume.reasons];
  const feed = buildHomepageFeed(all, { ...eligibilityOptions, limit: 50, minimumVisible: 30 });
  const lowRelevanceCount = feed.items.filter((article) => !isPublicProductFit(article)).length;
  if (lowRelevanceCount) reasons.push(`public_low_relevance_cards:${lowRelevanceCount}`);
  const sourceHits = findInternalLanguageHits([{ path: '/', surface: 'source', text: source }]);
  reasons.push(...sourceHits.map((hit) => `internal_homepage_phrase:${hit.phrase}`));
  if (/Signals being monitored|Published deskwork|Cycle status|EditorialCycleStatus|ActiveWatchlist/.test(source)) {
    reasons.push('operational_homepage_section_present');
  }
  return {
    ok: reasons.length === 0,
    reasons,
    eligibleCount: volume.eligibleCount,
    cardCount: volume.homepageCount,
    lowRelevanceCount,
    mode: volume.mode,
    safeModeEvidence: volume.safeModeEvidence,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = auditPublicHomepage();
  if (!result.ok) {
    console.error(`homepage audit failed: ${result.reasons.join(', ')}`);
    process.exitCode = 1;
  } else {
    console.log(result.mode === 'rights_review_safe_mode'
      ? 'homepage audit passed: rights_review_safe_mode'
      : `homepage audit passed: ${result.cardCount} cards from ${result.eligibleCount} eligible items`);
  }
}
