import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PUBLIC_ARTICLE_STATUSES,
  PUBLIC_ARTICLE_TIERS,
  isAdminEditable,
  isRssEligible,
  isSitemapEligible,
  migratePublicArticleContract,
  publicArticlePath,
  publicArticleUrl,
  validatePublicArticleContract,
} from '../scripts/lib/public-article-contract.mjs';

const sourceText = 'Source-backed data center capacity analysis links AI demand to utility interconnection, substation delivery, and phased campus energization. '.repeat(12);

function legacyArticle(overrides = {}) {
  return {
    id: 'legacy-1',
    title: 'Grid timing reshapes AI campus delivery',
    source: 'Data Center Example',
    sourceUrl: 'https://example.com/grid-timing',
    publishedAt: '2026-05-31T00:00:00.000Z',
    summary: 'Utility timing is becoming the practical constraint for AI campus delivery.',
    articleText: sourceText,
    primary_category: 'Data Centers',
    tags: ['power', 'capacity'],
    public_status: 'published',
    public_content_tier: 'longform_analysis',
    articlePagePublished: true,
    homepagePublished: true,
    archiveOnly: false,
    noindex: false,
    seo_noindex: false,
    public_routing: { visibility: 'core' },
    extraction_quality_score: 0.94,
    infrastructure_relevance_score: 0.91,
    generatedImage: '/generated/legacy-1.svg',
    generatedImageProvider: 'local-placeholder',
    imagePrompt: 'Data center campus power visual.',
    audit_log_refs: ['audit://legacy-1'],
    customLegacyThing: { keep: true },
    ...overrides,
  };
}

test('migrates legacy latest records into the public article contract without data loss', () => {
  const migrated = migratePublicArticleContract(legacyArticle());

  assert.equal(migrated.ok, true);
  assert.equal(migrated.unknownFieldsPreserved, true);
  assert.deepEqual(migrated.article.customLegacyThing, { keep: true });
  assert.equal(migrated.contract.title, 'Grid timing reshapes AI campus delivery');
  assert.equal(migrated.contract.dek, 'Utility timing is becoming the practical constraint for AI campus delivery.');
  assert.equal(migrated.contract.bodyMarkdown, sourceText.trim());
  assert.equal(migrated.contract.category, 'Data Centers');
  assert.deepEqual(migrated.contract.tags, ['power', 'capacity']);
  assert.deepEqual(migrated.contract.source, {
    name: 'Data Center Example',
    url: 'https://example.com/grid-timing',
    domain: 'example.com',
  });
  assert.equal(migrated.contract.status, PUBLIC_ARTICLE_STATUSES.PUBLISHED);
  assert.equal(migrated.contract.tier, PUBLIC_ARTICLE_TIERS.LONGFORM_ANALYSIS);
  assert.equal(migrated.article.generatedImage, '/generated/legacy-1.svg');
  assert.equal(migrated.contract.images.hero.url, '/generated/fallbacks/data-centers.svg');
  assert.equal(migrated.contract.images.hero.status, 'fallback');
  assert.deepEqual(migrated.contract.auditLogRefs, ['audit://legacy-1']);
});

test('distinguishes public statuses and article tiers used by legacy records', () => {
  const cases = [
    {
      raw: legacyArticle({ id: 'draft', public_status: 'draft', draft: true }),
      status: PUBLIC_ARTICLE_STATUSES.DRAFT,
      tier: PUBLIC_ARTICLE_TIERS.LONGFORM_ANALYSIS,
    },
    {
      raw: legacyArticle({ id: 'published', public_status: 'published' }),
      status: PUBLIC_ARTICLE_STATUSES.PUBLISHED,
      tier: PUBLIC_ARTICLE_TIERS.LONGFORM_ANALYSIS,
    },
    {
      raw: legacyArticle({ id: 'hidden', public_status: 'quarantined', public_content_tier: 'hidden', archiveOnly: true }),
      status: PUBLIC_ARTICLE_STATUSES.HIDDEN,
      tier: PUBLIC_ARTICLE_TIERS.HIDDEN,
    },
    {
      raw: legacyArticle({ id: 'noindex', public_status: 'noindex', seo_noindex: true, seo_noindex_reasons: ['manual_hold'] }),
      status: PUBLIC_ARTICLE_STATUSES.NOINDEX,
      tier: PUBLIC_ARTICLE_TIERS.LONGFORM_ANALYSIS,
    },
    {
      raw: legacyArticle({ id: 'brief', public_content_tier: 'editorial_brief', articlePagePublished: false, signalCardOnly: true }),
      status: PUBLIC_ARTICLE_STATUSES.PUBLISHED,
      tier: PUBLIC_ARTICLE_TIERS.EDITORIAL_BRIEF,
    },
    {
      raw: legacyArticle({ id: 'source', public_status: 'signal', public_content_tier: 'signal_card', articlePagePublished: false, signalCardOnly: true }),
      status: PUBLIC_ARTICLE_STATUSES.PUBLISHED,
      tier: PUBLIC_ARTICLE_TIERS.SOURCE_ONLY,
    },
  ];

  for (const item of cases) {
    const migrated = migratePublicArticleContract(item.raw);
    assert.equal(migrated.contract.status, item.status, item.raw.id);
    assert.equal(migrated.contract.tier, item.tier, item.raw.id);
  }
});

test('exposes deterministic public URL, sitemap, RSS, and admin helpers', () => {
  const longform = migratePublicArticleContract(legacyArticle()).contract;
  const sourceOnly = migratePublicArticleContract(legacyArticle({
    id: 'source-only',
    public_status: 'signal',
    public_content_tier: 'signal_card',
    articlePagePublished: false,
    signalCardOnly: true,
  })).contract;
  const hidden = migratePublicArticleContract(legacyArticle({
    id: 'hidden-helper',
    public_status: 'quarantined',
    public_content_tier: 'hidden',
    archiveOnly: true,
  })).contract;

  assert.equal(publicArticlePath(longform), '/news/legacy-1/');
  assert.equal(publicArticleUrl(longform, { siteUrl: 'https://www.computecurrent.com' }), 'https://www.computecurrent.com/news/legacy-1/');
  assert.equal(isSitemapEligible(longform), true);
  assert.equal(isRssEligible(longform), true);
  assert.equal(isAdminEditable(longform), true);

  assert.equal(publicArticlePath(sourceOnly), '');
  assert.equal(publicArticleUrl(sourceOnly), 'https://example.com/grid-timing');
  assert.equal(isSitemapEligible(sourceOnly), false);
  assert.equal(isRssEligible(sourceOnly), true);
  assert.equal(isAdminEditable(sourceOnly), true);

  assert.equal(publicArticleUrl(hidden), '');
  assert.equal(isSitemapEligible(hidden), false);
  assert.equal(isRssEligible(hidden), false);
  assert.equal(isAdminEditable(hidden), true);
});

test('rejects malformed public article contracts with actionable errors', () => {
  const migrated = migratePublicArticleContract({
    title: 'Malformed',
    public_status: 'launched',
    sourceUrl: 'not-a-url',
  });

  const validation = validatePublicArticleContract(migrated.contract);

  assert.equal(validation.ok, false);
  assert.match(validation.errors.join('\n'), /missing id/i);
  assert.match(validation.errors.join('\n'), /invalid status/i);
  assert.match(validation.errors.join('\n'), /invalid source URL/i);
});
