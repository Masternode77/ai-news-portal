import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { segmentNewsletterLead } from './newsletter-segmentation.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DEFAULT_STORE = path.join(ROOT, 'data/subscribers.jsonl');

export function validateSubscriber(lead = {}) {
  const normalized = segmentNewsletterLead(lead);
  const errors = [];
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalized.email)) errors.push('valid_email_required');
  return { ok: errors.length === 0, errors, subscriber: normalized };
}

export function saveSubscriber(lead = {}, options = {}) {
  const validation = validateSubscriber(lead);
  if (!validation.ok) return validation;
  const storePath = options.storePath || DEFAULT_STORE;
  fs.mkdirSync(path.dirname(storePath), { recursive: true });
  fs.appendFileSync(storePath, `${JSON.stringify(validation.subscriber)}\n`);
  return validation;
}

export function exportSubscribers(options = {}) {
  const storePath = options.storePath || DEFAULT_STORE;
  if (!fs.existsSync(storePath)) return [];
  return fs.readFileSync(storePath, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}
