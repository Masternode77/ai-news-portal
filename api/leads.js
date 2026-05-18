import { saveLead } from '../scripts/lib/lead-store.mjs';

function json(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}

async function readJson(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body || '{}');

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    json(res, 405, { ok: false, error: 'Method not allowed.' });
    return;
  }

  try {
    const body = await readJson(req);
    const result = await saveLead({
      ...body,
      user_agent: req.headers['user-agent'] || '',
    });

    if (!result.ok) {
      json(res, 400, { ok: false, errors: result.errors });
      return;
    }

    json(res, 202, {
      ok: true,
      id: result.lead.id,
      saved_to: result.saved_to,
    });
  } catch {
    json(res, 400, { ok: false, error: 'Invalid lead request.' });
  }
}
