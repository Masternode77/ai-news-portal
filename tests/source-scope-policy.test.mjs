import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applySourceScopePolicy,
  hasExplicitInfrastructureCapacityEvidence,
  sourceScopePolicyResult,
} from '../scripts/lib/source-scope-policy.mjs';

const awsWeeklyRoundup = {
  id: '181991a7b07d4c43',
  title: 'AWS Weekly Roundup: AWS Transform at 1 year, Claude Platform on AWS, EC2 M3 Ultra Mac instances, and more',
  source: 'AWS News Blog',
  sourceUrl: 'https://aws.amazon.com/blogs/aws/aws-weekly-roundup-aws-transform-at-1-year-claude-platform-on-aws-ec2-m3-ultra-mac-instances-and-more-may-18-2026/',
  source_count: 1,
  source_type: 'weekly_roundup',
  primary_category: 'Cloud Capacity',
  public_routing: { public_signal_label: 'Core Signal', routing_decision: 'Featured Analysis' },
  cleaned_source_text: 'AWS Transform for .NET, Mainframe and VMware workloads is an agentic AI service for modernizing enterprise applications. AWS Transform custom enables organizations to modernize code at scale using AWS-managed and custom transformations. Claude Platform on AWS and EC2 M3 Ultra Mac instances are included in the weekly roundup.',
};

test('single-source AWS weekly roundup is scoped as a platform note, not capacity', () => {
  const policy = sourceScopePolicyResult(awsWeeklyRoundup);
  assert.equal(policy.applies, true);
  assert.equal(policy.source_type, 'weekly_roundup');
  assert.equal(policy.has_explicit_capacity_evidence, false);
  assert.equal(policy.public_route, 'Enterprise Platform Note');

  const scoped = applySourceScopePolicy(awsWeeklyRoundup);
  assert.notEqual(scoped.public_routing.public_signal_label, 'Core Signal');
  assert.notEqual(scoped.primary_category, 'Cloud Capacity');
  assert.equal(scoped.public_route, 'Enterprise Platform Note');
});

test('single-source vendor posts need explicit capacity proof before Cloud Capacity routing', () => {
  assert.equal(hasExplicitInfrastructureCapacityEvidence(awsWeeklyRoundup), false);
  assert.equal(hasExplicitInfrastructureCapacityEvidence({
    ...awsWeeklyRoundup,
    cleaned_source_text: 'AWS launched a new cloud region with three availability zones and reserved capacity options for enterprise buyers.',
  }), true);
});
