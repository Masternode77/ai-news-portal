import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DEFAULT_LOCAL_STORE = path.join(ROOT, 'data/leads.jsonl');
const SERVERLESS_STORE = path.join(os.tmpdir(), 'compute-current-leads.jsonl');

const LEAD_TYPES = new Set([
  'newsletter',
  'pro_waitlist',
  'sponsor',
  'media_kit',
  'report',
  'enterprise',
  'directory',
  'contact',
]);

function defaultStorePath() {
  if (process.env.LEADS_STORE_PATH) return process.env.LEADS_STORE_PATH;
  if (process.env.VERCEL) return SERVERLESS_STORE;
  return DEFAULT_LOCAL_STORE;
}

function cleanValue(value) {
  if (Array.isArray(value)) return value.map(cleanValue).filter(Boolean);
  return String(value || '')
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 4000);
}

function cleanPayload(payload = {}) {
  return Object.fromEntries(
    Object.entries(payload)
      .map(([key, value]) => [cleanValue(key).slice(0, 80), cleanValue(value)])
      .filter(([key, value]) => key && (Array.isArray(value) ? value.length : value))
  );
}

export function leadTypeFromFormName(formName = '') {
  const name = String(formName || '').toLowerCase();
  if (name.startsWith('newsletter-')) return 'newsletter';
  if (name === 'pro-waitlist') return 'pro_waitlist';
  if (name === 'sponsor-inquiry') return 'sponsor';
  if (name === 'media-kit-contact') return 'media_kit';
  if (name.startsWith('report-')) return 'report';
  if (name === 'enterprise-demo') return 'enterprise';
  if (name.startsWith('directory-')) return 'directory';
  return 'contact';
}

export function validateLead(input = {}) {
  const payload = cleanPayload(input.payload || {});
  const formName = cleanValue(input.form_name || input.formName || payload.form_name || '');
  const type = cleanValue(input.type || leadTypeFromFormName(formName));
  const email = cleanValue(payload.email || input.email || '');
  const errors = [];

  if (!LEAD_TYPES.has(type)) errors.push('invalid_lead_type');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) errors.push('valid_email_required');

  const lead = {
    id: input.id || randomUUID(),
    type,
    form_name: formName,
    event_name: cleanValue(input.event_name || input.eventName || ''),
    page_url: cleanValue(input.page_url || input.pageUrl || ''),
    payload: {
      ...payload,
      email,
    },
    user_agent: cleanValue(input.user_agent || input.userAgent || ''),
    created_at: input.created_at || new Date().toISOString(),
  };

  return { ok: errors.length === 0, errors, lead };
}

export function appendLeadLocal(lead, options = {}) {
  const storePath = options.storePath || defaultStorePath();
  fs.mkdirSync(path.dirname(storePath), { recursive: true });
  fs.appendFileSync(storePath, `${JSON.stringify(lead)}\n`);
  return storePath;
}

async function postWebhook(lead, options = {}) {
  const webhookUrl = options.webhookUrl || process.env.LEADS_WEBHOOK_URL || process.env.LEAD_WEBHOOK_URL || '';
  if (!webhookUrl) return null;

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source: 'compute-current', lead }),
  });

  if (!response.ok) {
    throw new Error(`lead_webhook_failed_${response.status}`);
  }

  return webhookUrl;
}

export async function saveLead(input = {}, options = {}) {
  const validation = validateLead(input);
  if (!validation.ok) return validation;

  const savedTo = [];
  const errors = [];

  try {
    const webhookUrl = await postWebhook(validation.lead, options);
    if (webhookUrl) savedTo.push('webhook');
  } catch (error) {
    errors.push(error.message || 'lead_webhook_failed');
  }

  if (options.local !== false) {
    try {
      appendLeadLocal(validation.lead, options);
      savedTo.push(process.env.VERCEL ? 'serverless_tmp' : 'local_jsonl');
    } catch (error) {
      errors.push(error.message || 'lead_local_store_failed');
    }
  }

  return {
    ok: savedTo.length > 0,
    errors,
    lead: validation.lead,
    saved_to: savedTo,
  };
}

export function exportLeads(options = {}) {
  const storePath = options.storePath || defaultStorePath();
  if (!fs.existsSync(storePath)) return [];
  return fs.readFileSync(storePath, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}
