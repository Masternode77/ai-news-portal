import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

test('article page template presents Compute Current blog analysis before source link', async () => {
  const template = await fs.readFile('src/pages/news/[id].astro', 'utf8');
  const header = await fs.readFile('src/components/ArticleHeader.astro', 'utf8');
  const body = await fs.readFile('src/components/LongformArticleBody.astro', 'utf8');
  const hero = await fs.readFile('src/components/ArticleHeroImage.astro', 'utf8');
  const related = await fs.readFile('src/components/RelatedArticles.astro', 'utf8');
  const source = await fs.readFile('src/components/SourceAttribution.astro', 'utf8');

  assert.match(header, /By Compute Current/);
  assert.match(header, /aria-label="Breadcrumb"/);
  assert.match(template, /ArticleHeader/);
  assert.match(template, /ArticleHeroImage/);
  assert.match(template, /articleImageProvenance/);
  assert.match(template, /provenanceLabel=\{detailImageProvenance\.label\}/);
  assert.match(template, /provenanceKind=\{detailImageProvenance\.kind\}/);
  assert.match(template, /LongformArticleBody/);
  assert.match(template, /SourceAttribution/);
  assert.match(template, /AIDisclosureFooter/);
  assert.match(template, /RelatedArticles/);
  assert.ok(
    template.indexOf('ArticleHeroImage') > template.indexOf('ArticleHeader')
      && template.indexOf('ArticleHeroImage') < template.indexOf('LongformArticleBody'),
    'hero image should render near the headline before the longform body'
  );
  assert.match(hero, /<figure[\s\S]*class="[^"]*\barticle-hero-image\b[^"]*"/);
  assert.match(hero, /decoding="async"/);
  assert.match(hero, /provenanceLabel/);
  assert.match(hero, /data-image-provenance/);
  assert.doesNotMatch(hero, /article-image-provenance/);
  assert.doesNotMatch(hero, /\{provenanceLabel\}/);
  assert.match(body, /<section class="detail-section detail-article-copy longform-article-body"/);
  assert.match(related, /article\.id !== currentId/);
  assert.match(source, /<section class="source-attribution"/);
  assert.doesNotMatch(template, /Relevance Score|Urgency Score|Article Blueprint|Extraction Quality/);
});
