import assert from 'node:assert/strict';
import test from 'node:test';
import { vendorRoundupRoutingDecision, applyVendorRoundupRoutingRule } from '../scripts/lib/vendor-roundup-routing-rule.mjs';

const awsRoundup = {
  id: 'aws-weekly-fixture',
  title: 'AWS Weekly Roundup: platform updates and service notes',
  source: 'AWS News Blog',
  source_type: 'weekly_roundup',
  source_count: 1,
  public_signal_label: 'Core Signal',
  public_route: 'Core Longform Blog',
  primary_category: 'Cloud Capacity',
  cleaned_source_text: 'AWS published a weekly roundup describing product updates, service changes, documentation updates, and developer workflow improvements.',
  article_body_markdown: [
    'The source is useful as an enterprise platform note.',
    'What this does not prove is new data center capacity, power delivery, site readiness, supplier allocation, financing risk, utility milestones, or customer commitments.',
  ].join('\n\n'),
};

test('single-source vendor roundup is downgraded away from Core Signal and Cloud Capacity', () => {
  const scoped = applyVendorRoundupRoutingRule(awsRoundup);
  assert.notEqual(scoped.public_signal_label, 'Core Signal');
  assert.notEqual(scoped.primary_category, 'Cloud Capacity');
  assert.match(scoped.public_route, /Enterprise Platform Note|Cloud Product Read/);
});

test('vendor roundup rule rejects unsupported capacity claims', () => {
  const decision = vendorRoundupRoutingDecision({
    ...awsRoundup,
    article_body_markdown: 'This proves site readiness and supplier allocation for new cloud capacity.',
  });
  assert.equal(decision.ok, false);
  assert.ok(decision.reasons.some((reason) => reason.includes('vendor_roundup_unsupported')));
});
