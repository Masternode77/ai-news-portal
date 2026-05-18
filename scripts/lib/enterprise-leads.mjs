import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DEFAULT_STORE = path.join(ROOT, 'data/enterprise-leads.jsonl');

export const ENTERPRISE_CAPABILITIES = [
  'Custom AI infrastructure watchlists',
  'Market signal dashboard',
  'Power/grid risk tracker',
  'Deal and capital flow tracker',
  'Policy/siting risk monitor',
  'Company tracker',
  'Slack/Teams alerts',
  'API/RSS feed',
  'Monthly analyst call',
  'Custom research',
];

export function normalizeEnterpriseLead(lead = {}) {
  return {
    name: String(lead.name || '').trim(),
    company: String(lead.company || '').trim(),
    role: String(lead.role || '').trim(),
    email: String(lead.email || '').trim().toLowerCase(),
    use_case: String(lead.use_case || '').trim(),
    team_size: String(lead.team_size || '').trim(),
    budget_range: String(lead.budget_range || '').trim(),
    requested_capabilities: Array.isArray(lead.requested_capabilities) ? lead.requested_capabilities : [],
    created_at: lead.created_at || new Date().toISOString(),
  };
}

export function validateEnterpriseLead(lead = {}) {
  const normalized = normalizeEnterpriseLead(lead);
  const errors = [];
  if (!normalized.name) errors.push('name_required');
  if (!normalized.company) errors.push('company_required');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalized.email)) errors.push('valid_email_required');
  return { ok: errors.length === 0, errors, lead: normalized };
}

export function saveEnterpriseLead(lead = {}, options = {}) {
  const validation = validateEnterpriseLead(lead);
  if (!validation.ok) return validation;
  const storePath = options.storePath || DEFAULT_STORE;
  fs.mkdirSync(path.dirname(storePath), { recursive: true });
  fs.appendFileSync(storePath, `${JSON.stringify(validation.lead)}\n`);
  return validation;
}
