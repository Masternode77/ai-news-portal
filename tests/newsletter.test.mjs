import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  buildWeeklyDigest,
  renderWeeklyDigestHtml,
} from '../scripts/lib/newsletter.mjs';
import {
  authorizePublicTestRecords,
  canonicalAdminArticle,
} from './fixtures/admin-publication-integrity.mjs';

const now = new Date('2026-08-10T12:00:00.000Z');

function article(index, publishedAt, overrides = {}) {
  const title = overrides.title || `Grid delivery milestone ${index}`;
  return {
    ...canonicalAdminArticle({ published: true }),
    id: `digest-${index}`,
    title,
    sourceUrl: `https://source-${index}.example/report`,
    publishedAt,
    analysisPublishedAt: publishedAt,
    expertLensFull: {
      ...canonicalAdminArticle({ published: true }).expertLensFull,
      finalHeadline: title,
    },
    ...overrides,
  };
}

test('weekly digest contains at most six currently authorized public-page articles from the last seven days', () => {
  const candidates = Array.from({ length: 8 }, (_, index) => article(
    index,
    new Date(now.getTime() - (index + 1) * 3_600_000).toISOString(),
  ));
  const authorized = authorizePublicTestRecords(candidates, now.toISOString());
  const digest = buildWeeklyDigest(authorized.records, { ...authorized.options, now });

  assert.equal(digest.count, 6);
  assert.deepEqual(digest.articles.map((item) => item.id), candidates.slice(0, 6).map((item) => item.id));
  assert.ok(digest.articles.every((item) => item.href.startsWith('/news/')));
});

test('future, older, invalid-date, and denied-source records are excluded while public briefs remain discoverable', () => {
  const eligible = article(1, '2026-08-09T12:00:00.000Z');
  const future = article(2, '2026-08-11T12:00:00.000Z');
  const old = article(3, '2026-08-02T12:00:00.000Z');
  const invalid = article(4, 'not-a-date');
  const brief = article(5, '2026-08-09T11:00:00.000Z', {
    articlePagePublished: false,
    public_content_tier: 'editorial_brief',
    signalCardOnly: true,
    public_routing: { visibility: 'adjacent' },
  });
  const authorized = authorizePublicTestRecords([eligible, future, old, invalid, brief], now.toISOString());
  const denied = article(6, '2026-08-09T10:00:00.000Z', {
    sourceRegistryId: 'not-authorized',
    sourceUrl: 'https://denied.example/report',
  });
  const digest = buildWeeklyDigest([...authorized.records, denied], { ...authorized.options, now });

  assert.deepEqual(digest.articles.map((item) => item.id), ['digest-1', 'digest-5']);
  assert.equal(digest.articles[1].type, 'Brief');
});

test('weekly digest includes eligible authored columns from the same public catalog', () => {
  const column = {
    id: 'col-digest',
    slug: 'grid-capacity-column',
    title: 'Grid capacity is the commercial constraint for new clusters',
    deck: 'A source-backed column about interconnection timing and delivery risk for AI infrastructure.',
    publishedAt: '2026-08-10T10:00:00.000Z',
    content_origin: 'authored',
    generation_version: 'authored_column_v1',
    public_content_tier: 'authored_column',
    public_status: 'published',
    primary_category: 'Power & Grid',
    sources: [{ name: 'Grid operator', url: 'https://example.com/grid' }],
    expertLensFull: { finalArticleBody: 'Complete column body.' },
    authored_quality: { ok: true },
  };
  const digest = buildWeeklyDigest([], { now, columns: [column] });

  assert.equal(digest.count, 1);
  assert.equal(digest.articles[0].type, 'Column');
  assert.equal(digest.articles[0].href, '/column/grid-capacity-column/');
});

test('rendered digest escapes hostile titles and attributes', () => {
  const html = renderWeeklyDigestHtml({ articles: [{
    title: '<img src=x onerror="alert(1)">',
    category: 'Power & Grid',
    publishedAt: '2026-08-10T00:00:00.000Z',
    deck: '<script>alert(2)</script>',
    whyItMatters: 'Capacity & timing',
    href: '/news/example?x="bad"',
  }] });

  assert.doesNotMatch(html, /<(?:img|script)\b/i);
  assert.match(html, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;/);
  assert.match(html, /Power &amp; Grid/);
  assert.match(html, /href="https:\/\/www\.computecurrent\.com\/newsletter\/"/);
});

test('weekly digest page uses ProductLayout and contains no subscription or sender integration', () => {
  const page = fs.readFileSync('src/pages/newsletter/index.astro', 'utf8');
  assert.match(page, /ProductLayout/);
  assert.match(page, /href="\/rss\.xml"/);
  assert.doesNotMatch(page, /<form\b|subscribe|email list|sender|PUBLIC_NEWSLETTER_SUBSCRIBE_URL/i);
  assert.match(page, /\{article\.title\}/);
  assert.doesNotMatch(page, /set:html/);
});

test('digest builder is generation-only and contains no external dispatch integration', () => {
  const script = fs.readFileSync('scripts/build-weekly-digest.mjs', 'utf8');
  assert.match(script, /--format=json/);
  assert.match(script, /renderWeeklyDigestHtml/);
  assert.doesNotMatch(script, /resend|sendgrid|mailchimp|postmark|nodemailer|fetch\s*\(/i);
});
