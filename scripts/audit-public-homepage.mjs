import fs from 'node:fs';
import latestNews from '../src/data/latest-news.json' with { type: 'json' };
import archivedNews from '../src/data/archived-news.json' with { type: 'json' };
import { buildHomepageFeed, publicHomepageFeedEligible } from './lib/homepage-feed-builder.mjs';
import { findInternalLanguageHits } from './lib/internal-language-guard.mjs';

export function auditPublicHomepage() {
  const all = [...latestNews, ...archivedNews];
  const eligible = all.filter(publicHomepageFeedEligible);
  const feed = buildHomepageFeed(all, { limit: 50, minimumVisible: 30 });
  const reasons = [];
  if (eligible.length >= 20 && feed.items.length < 20) reasons.push(`homepage_cards_below_20:${feed.items.length}`);
  if (eligible.length >= 30 && feed.items.length < 30) reasons.push(`homepage_cards_below_30:${feed.items.length}`);
  const source = fs.readFileSync('src/pages/index.astro', 'utf8');
  const sourceHits = findInternalLanguageHits([{ path: '/', surface: 'source', text: source }]);
  reasons.push(...sourceHits.map((hit) => `internal_homepage_phrase:${hit.phrase}`));
  if (/Signals being monitored|Published deskwork|Cycle status|EditorialCycleStatus|ActiveWatchlist/.test(source)) {
    reasons.push('operational_homepage_section_present');
  }
  return {
    ok: reasons.length === 0,
    reasons,
    eligibleCount: eligible.length,
    cardCount: feed.items.length,
  };
}

const result = auditPublicHomepage();
if (!result.ok) {
  console.error(`homepage audit failed: ${result.reasons.join(', ')}`);
  process.exitCode = 1;
} else {
  console.log(`homepage audit passed: ${result.cardCount} cards from ${result.eligibleCount} eligible items`);
}
