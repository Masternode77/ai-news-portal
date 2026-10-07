import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  buildPublicPublicationCatalog,
  filterPublications,
} from '../scripts/lib/public-publication-catalog.mjs';

const publishedColumn = {
  id: 'col-public',
  slug: 'grid-capacity-is-the-real-constraint-2026-10-08',
  title: 'Grid capacity is the real constraint for the next cluster',
  deck: 'A source-backed view of interconnection timing and AI infrastructure delivery.',
  summary: 'A source-backed view of interconnection timing and AI infrastructure delivery.',
  publishedAt: '2026-10-08T01:00:00.000Z',
  updatedAt: '2026-10-08T01:00:00.000Z',
  content_origin: 'authored',
  generation_version: 'authored_column_v1',
  public_content_tier: 'authored_column',
  public_status: 'published',
  primary_category: 'Power & Grid',
  region: 'US',
  tags: ['grid', 'interconnection'],
  sources: [{ name: 'Grid operator', url: 'https://example.com/grid-report' }],
  expertLensFull: { finalArticleBody: 'A complete published column body.' },
  authored_quality: { ok: true },
  heroImage: '/generated/articles/column/hero.webp',
};

test('public publication catalog includes eligible columns and excludes private drafts', () => {
  const draft = {
    ...publishedColumn,
    id: 'col-draft',
    slug: 'private-draft',
    draft: true,
    public_status: 'draft',
  };
  const catalog = buildPublicPublicationCatalog({ columns: [publishedColumn, draft] });

  assert.equal(catalog.length, 1);
  assert.equal(catalog[0].id, 'col-public');
  assert.equal(catalog[0].type, 'Column');
  assert.equal(catalog[0].href, '/column/grid-capacity-is-the-real-constraint-2026-10-08/');
  assert.equal(catalog[0].source, 'Grid operator');
});

test('publication search combines query, category, type, source, date and pagination', () => {
  const catalog = buildPublicPublicationCatalog({ columns: [
    publishedColumn,
    {
      ...publishedColumn,
      id: 'col-europe',
      slug: 'european-capacity-2026-09-01',
      title: 'European capacity planning moves into permitting',
      publishedAt: '2026-09-01T01:00:00.000Z',
      primary_category: 'Policy & Siting',
      region: 'Europe',
      sources: [{ name: 'European Commission', url: 'https://example.com/eu' }],
    },
  ] });

  const result = filterPublications(catalog, {
    query: 'grid interconnection',
    category: 'power-grid',
    type: 'column',
    source: 'Grid operator',
    dateFrom: '2026-10-01',
    dateTo: '2026-10-08',
    page: 1,
    pageSize: 1,
  });

  assert.equal(result.total, 1);
  assert.equal(result.pageCount, 1);
  assert.equal(result.items[0].id, 'col-public');
});

test('publication catalog pagination is deterministic and bounded', () => {
  const columns = Array.from({ length: 21 }, (_, index) => ({
    ...publishedColumn,
    id: `col-${index}`,
    slug: `column-${index}`,
    title: `Grid capacity analysis number ${String(index).padStart(2, '0')}`,
    publishedAt: new Date(Date.parse('2026-10-08T01:00:00.000Z') - index * 3_600_000).toISOString(),
  }));
  const catalog = buildPublicPublicationCatalog({ columns });
  const page = filterPublications(catalog, { page: 2, pageSize: 12 });

  assert.equal(page.total, 21);
  assert.equal(page.pageCount, 2);
  assert.equal(page.items.length, 9);
  assert.equal(page.items[0].id, 'col-12');
});

test('current public catalog carries all 21 eligible authored columns and no private column', () => {
  const articles = [
    ...JSON.parse(fs.readFileSync('src/data/latest-news.json', 'utf8')),
    ...JSON.parse(fs.readFileSync('src/data/archived-news.json', 'utf8')),
  ];
  const columns = JSON.parse(fs.readFileSync('src/data/authored-columns.json', 'utf8'));
  const catalog = buildPublicPublicationCatalog({ articles, columns });
  const publicColumnIds = new Set(catalog.filter((item) => item.type === 'Column').map((item) => item.id));

  assert.equal(columns.length, 21);
  assert.equal(publicColumnIds.size, 21);
  assert.ok(columns.every((column) => publicColumnIds.has(column.id)));
});
