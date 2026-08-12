import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { auditBlogSurfaceV4 } from '../scripts/audit-blog-surface-v4.mjs';
import { HOMEPAGE_MIN_LOCAL_BLOGS } from '../scripts/lib/homepage-blog-surface-policy.mjs';
import { authorizePublicTestRecords } from './fixtures/admin-publication-integrity.mjs';

const analysisParagraph = [
  'Grid operators reported a defined capacity request with named procurement dependencies, interconnection milestones, and facility delivery exposure.',
  'Infrastructure buyers can use those disclosed constraints to compare energization timing, equipment availability, customer commitments, and permitting risk.',
  'The limitation is that schedule confidence still depends on utility milestones that the current disclosure does not prove.',
  'Operators should watch the next capacity update for dated evidence that power delivery and construction sequencing remain aligned.',
].join(' ');

function fixtureBody(index) {
  const headings = [
    'Capacity Signal',
    `Infrastructure Read ${index}`,
    `Beneficiary Map ${index}`,
    `Exposure Ledger ${index}`,
    `Decision Point ${index}`,
    `Bottom Line ${index}`,
  ];
  return headings.flatMap((heading, headingIndex) => [
    heading,
    `${analysisParagraph} Review lane ${index}-${headingIndex}-a keeps this fixture specific.`,
    `${analysisParagraph} Review lane ${index}-${headingIndex}-b keeps this fixture specific.`,
  ]).join('\n\n');
}

test('legacy blog surface audit flags repeated fixture openings under autonomous desk policy', async (context) => {
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'blog-surface-v4-regression-'));
  const reportPath = path.join(temporaryDirectory, 'blog-surface-v4-audit-report.md');
  context.after(() => fs.rmSync(temporaryDirectory, { recursive: true, force: true }));
  const latest = Array.from({ length: 20 }, (_, index) => ({
    id: `fixture-${index}`,
    title: `Data center power capacity fixture ${index}`,
    source: index % 2 ? 'Utility Dive' : 'Data Center Dynamics',
    publishedAt: new Date(Date.now() - index * 1000).toISOString(),
    articlePagePublished: true,
    homepagePublished: true,
    archiveOnly: false,
    noindex: false,
    public_status: 'published',
    generation_version: 'autonomous_editorial_desk_v1',
    blog_route: 'standard_blog',
    summary: 'Data center power capacity and grid planning are central to this item.',
    extraction_quality_score: 0.95,
    infrastructure_relevance_score: 0.82,
    blog_metadata: {
      thesis: 'Utility delivery evidence determines whether announced capacity becomes usable infrastructure.',
      source_summary_ratio: 0.3,
      analysis_ratio: 0.7,
      tone: `tone-${index % 5}`,
      archetype: `archetype-${index % 5}`,
    },
    expertLensFull: { finalArticleBody: fixtureBody(index) },
  }));
  const authorized = authorizePublicTestRecords(latest);
  const result = await auditBlogSurfaceV4({
    latest: authorized.records,
    archived: [],
    eligibilityOptions: authorized.options,
    reportPath,
  });
  assert.equal(result.ok, false);
  assert.deepEqual(result.reasons, ['duplicate_first_10_opening_words']);
  assert.equal(result.publicHomepageCardCount, 20);
  assert.equal(result.publicDetailCount, 20);
  assert.equal(result.homepage.localBlogCount, 20);
  assert.equal(result.articleResults.every(({ result: articleResult }) => articleResult.ok), true);
  assert.equal(result.reportPath, reportPath);
  assert.equal(fs.existsSync(reportPath), true);
});

test('source-only audit excludes retained records that fail current public eligibility', async (context) => {
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'blog-surface-v4-source-only-'));
  const reportPath = path.join(temporaryDirectory, 'blog-surface-v4-audit-report.md');
  context.after(() => fs.rmSync(temporaryDirectory, { recursive: true, force: true }));
  const retained = Array.from({ length: 30 }, (_, index) => ({
    id: `retained-${index}`,
    title: `Grid capacity retained record ${index}`,
    homepagePublished: true,
    articlePagePublished: true,
    public_status: 'published',
  }));

  const result = await auditBlogSurfaceV4({
    latest: retained,
    archived: [],
    eligibilityOptions: { sourceRegistry: [], now: '2026-08-10T00:00:00.000Z' },
    reportPath,
  });

  assert.equal(result.publicHomepageCardCount, 0);
  assert.equal(result.publicDetailCount, 0);
  assert.equal(result.sourceOnlyCardCount, 0);
  assert.equal(result.rightsReviewSafeMode, true);
  assert.deepEqual(result.reasons, [
    `homepage_local_blog_count_below_${HOMEPAGE_MIN_LOCAL_BLOGS}`,
    'rights_review_safe_mode_zero_authorized_sources',
  ]);
});

test('built audit uses current public eligibility before checking rendered detail output', async (context) => {
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'blog-surface-v4-built-'));
  const reportPath = path.join(temporaryDirectory, 'blog-surface-v4-audit-report.md');
  const distDir = path.join(temporaryDirectory, 'dist');
  context.after(() => fs.rmSync(temporaryDirectory, { recursive: true, force: true }));

  const result = await auditBlogSurfaceV4({
    latest: [{ id: 'retained-built', title: 'Retained but unauthorized grid record', homepagePublished: true, articlePagePublished: true }],
    archived: [],
    eligibilityOptions: { sourceRegistry: [], now: '2026-08-10T00:00:00.000Z' },
    requireBuiltPages: true,
    distDir,
    reportPath,
  });

  assert.equal(result.publicHomepageCardCount, 0);
  assert.equal(result.publicDetailCount, 0);
  assert.equal(result.sourceOnlyCardCount, 0);
  assert.equal(result.builtOutputChecked, true);
  assert.deepEqual(result.reasons, [
    `homepage_local_blog_count_below_${HOMEPAGE_MIN_LOCAL_BLOGS}`,
    'rights_review_safe_mode_zero_authorized_sources',
  ]);
});
