import fs from 'node:fs/promises';
import path from 'node:path';

const STORE_PATH = process.env.SUBSCRIBER_STORE_PATH || 'data/subscribers.ndjson';

export function subscriberStoreMode() {
  if (process.env.NEWSLETTER_API_URL && process.env.NEWSLETTER_API_KEY) return 'remote';
  if (process.env.ENABLE_LOCAL_SUBSCRIBER_STORE === '1') return 'local';
  return 'noop';
}

export async function storeSubscriber(input = {}) {
  const record = {
    email: String(input.email || '').trim(),
    role: String(input.role || '').trim(),
    company: String(input.company || '').trim(),
    interests: Array.isArray(input.interests) ? input.interests : [input.interest].filter(Boolean),
    createdAt: new Date().toISOString(),
  };
  if (!record.email) return { ok: false, mode: subscriberStoreMode(), reason: 'missing_email' };
  const mode = subscriberStoreMode();
  if (mode === 'local') {
    await fs.mkdir(path.dirname(STORE_PATH), { recursive: true });
    await fs.appendFile(STORE_PATH, `${JSON.stringify(record)}\n`, 'utf8');
  }
  return { ok: true, mode, record: mode === 'noop' ? { ...record, email: '[not stored]' } : record };
}
