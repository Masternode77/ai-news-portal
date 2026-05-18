import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { exportLeads, leadTypeFromFormName, saveLead, validateLead } from '../scripts/lib/lead-store.mjs';

test('lead store validates email and maps monetization forms', () => {
  assert.equal(leadTypeFromFormName('newsletter-homepage-hero'), 'newsletter');
  assert.equal(leadTypeFromFormName('sponsor-inquiry'), 'sponsor');
  assert.equal(leadTypeFromFormName('report-ai-power-index'), 'report');

  const invalid = validateLead({
    form_name: 'newsletter-homepage-hero',
    payload: { email: 'not-an-email' },
  });
  assert.equal(invalid.ok, false);
  assert.match(invalid.errors.join(' '), /valid_email_required/);
});

test('lead store writes exportable JSONL records', async () => {
  const storePath = path.join(os.tmpdir(), `compute-current-leads-${Date.now()}.jsonl`);
  const result = await saveLead({
    form_name: 'enterprise-demo',
    event_name: 'enterprise_cta_click',
    page_url: 'https://www.computecurrent.com/enterprise/request-demo/',
    payload: {
      email: 'buyer@example.com',
      company: 'Example Infra',
      capabilities: ['API/RSS', 'Slack/Teams alerts'],
    },
  }, { storePath, webhookUrl: '', local: true });

  assert.equal(result.ok, true);
  assert.deepEqual(result.saved_to, ['local_jsonl']);

  const leads = exportLeads({ storePath });
  assert.equal(leads.length, 1);
  assert.equal(leads[0].type, 'enterprise');
  assert.equal(leads[0].payload.email, 'buyer@example.com');

  fs.rmSync(storePath, { force: true });
});
