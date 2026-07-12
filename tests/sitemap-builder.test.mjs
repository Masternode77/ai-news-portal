import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSitemapEntries, sitemapXml } from '../scripts/lib/sitemap-builder.mjs';
import { generateLongformAnalysis } from '../scripts/lib/longform-engine.mjs';

function validLongform() {
  const articleText = 'A utility filing ties a contracted AI campus to substation delivery, transformer procurement, cooling completion, customer fit-out, financing, and a dated energization milestone. '.repeat(12);
  const article = generateLongformAnalysis({
    id: 'a',
    title: 'Grid delivery sets the schedule for a contracted AI campus',
    source: 'Infrastructure Filing',
    sourceUrl: 'https://example.com/contracted-campus',
    publishedAt: '2026-05-20T00:00:00Z',
    updatedAt: '2026-05-20T00:00:00Z',
    category: 'Power & Grid',
    primary_category: 'Power & Grid',
    infrastructure_layer: 'power',
    extraction_quality_score: 0.95,
    infrastructure_relevance_score: 0.9,
    articleText,
    rawText: articleText,
    summary: 'A contracted campus still depends on utility and construction milestones.',
  });
  return {
    ...article,
    source_fidelity: { ok: true },
    claim_fidelity: { ok: true, unsupportedClaims: [] },
    seo_fidelity: { ok: true },
  };
}

test('sitemap builder includes article and taxonomy pages while excluding archive-only records', () => {
  const dynamicTaxonomyArticle = validLongform();
  dynamicTaxonomyArticle.id = 'dynamic-taxonomy';
  dynamicTaxonomyArticle.sourceUrl = 'https://example.com/dynamic-taxonomy';
  dynamicTaxonomyArticle.companies = ['Cerebras'];
  dynamicTaxonomyArticle.region = 'Korea';
  const entries = buildSitemapEntries([
    validLongform(),
    dynamicTaxonomyArticle,
    { id: 'b', articlePagePublished: false, archiveOnly: true, public_status: 'archive_only_noindex', noindex: true },
  ]);
  const articleEntry = entries.find((entry) => entry.loc === '/news/a/');
  assert.ok(articleEntry);
  assert.equal(articleEntry.image, '/generated/fallbacks/power-grid.svg');
  assert.equal(entries.some((entry) => entry.loc === '/news/b/'), false);
  for (const loc of ['/', '/archive/']) {
    assert.ok(entries.some((entry) => entry.loc === loc), `expected static public page ${loc}`);
  }
  for (const loc of ['/about/', '/methodology/', '/editorial-policy/', '/ai-disclosure/', '/contact/']) {
    assert.equal(entries.some((entry) => entry.loc === loc), false, `expected retired public page ${loc} to stay out of sitemap`);
  }
  for (const loc of ['/subscribe/', '/pricing/', '/sample/', '/briefing/']) {
    assert.equal(entries.some((entry) => entry.loc === loc), false, `expected legacy conversion page ${loc} to stay out of sitemap`);
  }
  assert.ok(entries.some((entry) => entry.loc === '/company/cerebras/'));
  assert.ok(entries.some((entry) => entry.loc === '/region/korea/'));
  assert.equal(entries.find((entry) => entry.loc === '/company/cerebras/').lastmod, '2026-05-20T00:00:00.000Z');
  const xml = sitemapXml(entries);
  assert.match(xml, /<urlset/);
  assert.match(xml, /<image:image>/);
  assert.doesNotMatch(xml, /\/admin\//);
});

test('sitemap builder excludes quality-valid draft and hidden longforms', () => {
  const draft = { ...validLongform(), id: 'draft', public_status: 'draft' };
  const hidden = { ...validLongform(), id: 'hidden', public_status: 'hidden' };
  const entries = buildSitemapEntries([draft, hidden]);

  assert.equal(entries.some((entry) => entry.loc === '/news/draft/'), false);
  assert.equal(entries.some((entry) => entry.loc === '/news/hidden/'), false);
});
