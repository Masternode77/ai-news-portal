import assert from 'node:assert/strict';
import test from 'node:test';
import { publicPublishQualityGate } from '../scripts/lib/public-publish-quality-gate.mjs';
import { writeEditorialBlogArticleV2 } from '../scripts/lib/editorial-blog-writer-v2.mjs';

function awsFixture() {
  return {
    id: '181991a7b07d4c43',
    title: 'AWS: AWS Weekly Roundup: AWS Transform at 1 year, Claude Platform on AWS, EC2 M3 Ultra Mac instances, and more (May 18, 2026)',
    source: 'AWS News Blog',
    sourceUrl: 'https://aws.amazon.com/blogs/aws/aws-weekly-roundup-aws-transform-at-1-year-claude-platform-on-aws-ec2-m3-ultra-mac-instances-and-more-may-18-2026/',
    source_count: 1,
    source_type: 'weekly_roundup',
    primary_category: 'Cloud Capacity',
    infrastructure_layer: 'Cloud Platform',
    infrastructure_relevance_score: 0.73,
    extraction_quality_score: 0.88,
    public_routing: {
      visibility: 'core',
      laneKey: 'featured-analysis',
      laneTitle: 'Featured Analysis',
      public_signal_label: 'Core Signal',
      routing_decision: 'Featured Analysis',
    },
    cleaned_source_text: [
      'AWS Transform for .NET, Mainframe and VMware workloads is an agentic AI service for modernizing enterprise applications at scale.',
      'AWS Transform custom enables organizations to modernize and transform code at scale using AWS-managed and custom transformations.',
      'Organizations can upgrade language versions, migrate frameworks, optimize performance, and analyze code bases using ready-to-use or custom transformations.',
      'AWS also introduced Windows modernization capabilities, Reimagine capabilities, and automated testing functionality for mainframe workloads.',
    ].join(' '),
    evidence_pack: {
      verified_facts: [
        'AWS Transform for .NET, Mainframe and VMware workloads is an agentic AI service for modernizing enterprise applications at scale.',
        'AWS Transform custom enables organizations to modernize and transform code at scale using AWS-managed and custom transformations.',
        'Organizations can upgrade language versions, migrate frameworks, optimize performance, and analyze code bases using ready-to-use or custom transformations.',
        'AWS also introduced Windows modernization capabilities, Reimagine capabilities, and automated testing functionality for mainframe workloads.',
      ],
    },
  };
}

test('gate rejects public leakage and source-scope overclaiming', () => {
  const article = {
    ...awsFixture(),
    article_body_markdown: [
      'Backfilled Analysis',
      'The source item centers on AWS Weekly Roundup.',
      'Cloud Platform is the control point in this story.',
      'The cluster clears the desk bar.',
    ].join('\n\n'),
    bottom_line: 'Bottom line.',
  };
  const result = publicPublishQualityGate(article);
  assert.equal(result.ok, false);
  assert.ok(result.reasons.some((reason) => reason.includes('internal_label_leak')));
  assert.ok(result.reasons.includes('source_scope_core_signal_overclaim'));
  assert.ok(result.reasons.includes('source_scope_cloud_capacity_overclaim'));
});

test('editorial v2 writer produces a publishable platform note for AWS roundup', () => {
  const result = writeEditorialBlogArticleV2(awsFixture());
  assert.equal(result.ok, true, result.reasons.join(', '));
  assert.equal(result.article.public_signal_label, 'Enterprise Platform Note');
  assert.notEqual(result.article.primary_category, 'Cloud Capacity');
  assert.equal(result.article.public_route, 'Enterprise Platform Note');
  assert.doesNotMatch(result.article.article_body_markdown, /source item centers on|infrastructure lane|evidence anchor|cluster clears the desk bar|control point in this story/i);
  assert.match(result.article.article_body_markdown, /What this does not prove/);
});
