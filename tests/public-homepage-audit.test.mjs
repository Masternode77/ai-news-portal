import assert from 'node:assert/strict';
import test from 'node:test';
import { auditPublicHomepage } from '../scripts/audit-public-homepage.mjs';
import { authorizePublicTestRecords } from './fixtures/admin-publication-integrity.mjs';

const CLEAN_HOMEPAGE_SOURCE = '<main><h1>AI Infrastructure Intelligence</h1><h2>Latest Analysis</h2></main>';
const SAFE_MODE_EVIDENCE = {
  authorizedSourceCount: 0,
  publicCardCount: 0,
  publicDetailCount: 0,
  rssItemCount: 0,
  localNewsLinkCount: 0,
  paidAdsEnabled: false,
  pauseStateVisible: true,
};

function signalRecords(count = 30) {
  return Array.from({ length: count }, (_, index) => ({
    id: `homepage-audit-signal-${index}`,
    title: `Utility interconnection milestone ${index + 1} changes AI data center timing`,
    summary: `The grid operator approved substation work ${index + 1} for a large AI data center campus.`,
    articleText: `Utility interconnection evidence ${index + 1} connects substation construction, grid capacity, and AI data center commissioning. `.repeat(8),
    sourceUrl: `https://example.com/homepage-audit-signal-${index}`,
    publishedAt: new Date(Date.UTC(2026, 7, 9, 0, index)).toISOString(),
    public_content_tier: 'signal_card',
    public_status: 'published',
    public_routing: { visibility: 'adjacent' },
    homepagePublished: true,
    archiveOnly: false,
  }));
}

test('homepage audit accepts an explicitly rights-authorized quality inventory', () => {
  const authorized = authorizePublicTestRecords(signalRecords());

  const result = auditPublicHomepage({
    all: authorized.records,
    source: CLEAN_HOMEPAGE_SOURCE,
    eligibilityOptions: authorized.options,
  });

  // Then: the current quality-gated feed passes without a stale 30-card floor.
  assert.equal(result.ok, true, result.reasons.join(', '));
  assert.ok(result.cardCount > 0);
  assert.ok(result.eligibleCount >= result.cardCount);
});

test('homepage audit fails when eligible cards collapse below the canonical floor', () => {
  // Given: twenty eligible records that deduplicate to one public card.
  const eligibleArticle = signalRecords(1)[0];
  const duplicatedCandidates = Array.from({ length: 20 }, (_, index) => ({
    ...eligibleArticle,
    id: `homepage-audit-duplicate-${index}`,
    sourceUrl: 'https://example.com/homepage-audit-duplicate',
  }));
  const authorized = authorizePublicTestRecords(duplicatedCandidates);

  // When: the public homepage audit applies the shared feed-volume policy.
  const result = auditPublicHomepage({
    all: authorized.records,
    source: CLEAN_HOMEPAGE_SOURCE,
    eligibilityOptions: authorized.options,
  });

  // Then: lossy deduplication cannot silently shrink the feed below policy.
  assert.equal(result.eligibleCount, 20);
  assert.ok(result.cardCount < 20);
  assert.ok(result.reasons.includes('public_card_count_below_20'));
  assert.equal(result.ok, false);
});

test('homepage audit preserves internal-language and operational-section checks', () => {
  // Given: a homepage source containing operational reader-facing copy.
  const source = '<main><h2>Cycle status</h2><p>Published deskwork</p></main>';

  // When: the public homepage audit inspects the source.
  const result = auditPublicHomepage({ all: [], source });

  // Then: the operational section still fails closed independently of feed volume.
  assert.ok(result.reasons.includes('operational_homepage_section_present'));
  assert.ok(result.reasons.some((reason) => reason.startsWith('internal_homepage_phrase:')));
  assert.equal(result.ok, false);
});

test('homepage audit accepts an explicit empty rights review safe mode', () => {
  const result = auditPublicHomepage({
    all: [],
    source: CLEAN_HOMEPAGE_SOURCE,
    safeModeEvidence: SAFE_MODE_EVIDENCE,
  });

  assert.equal(result.ok, true, result.reasons.join(', '));
  assert.equal(result.mode, 'rights_review_safe_mode');
  assert.equal(result.cardCount, 0);
});

test('homepage audit rejects rights review safe mode when a local story link leaks', () => {
  const result = auditPublicHomepage({
    all: [],
    source: CLEAN_HOMEPAGE_SOURCE,
    safeModeEvidence: { ...SAFE_MODE_EVIDENCE, localNewsLinkCount: 1 },
  });

  assert.equal(result.ok, false);
  assert.ok(result.reasons.includes('rights_review_safe_mode_local_news_links_present'));
});
