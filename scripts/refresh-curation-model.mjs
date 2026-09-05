import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pickLatestOpenAiCurationModel } from './lib/curation-model-picker.mjs';
import { callOpenRouterJson } from './lib/openrouter.mjs';

const CONFIG_PATH = 'config/curation-model.json';
const CATALOGUE_URL = 'https://openrouter.ai/api/v1/models';

async function readConfig() {
  try {
    return JSON.parse(await fs.readFile(CONFIG_PATH, 'utf8'));
  } catch {
    return { model: null };
  }
}

async function verifyModel(model) {
  if (!process.env.OPENROUTER_API_KEY) return { verified: false, reason: 'no_api_key' };
  try {
    const reply = await callOpenRouterJson({
      model,
      systemPrompt: 'Reply with JSON only.',
      userPrompt: 'Return {"ok": true} and nothing else.',
      maxTokens: 400,
      responseFormat: { type: 'json_object' },
      timeoutMs: 60_000,
    });
    return reply && reply.ok === true ? { verified: true } : { verified: false, reason: 'unexpected_reply' };
  } catch (error) {
    return { verified: false, reason: error?.message || 'request_failed' };
  }
}

export async function refreshCurationModel({ fetchImpl = fetch, now = new Date(), write = true } = {}) {
  const response = await fetchImpl(CATALOGUE_URL, { headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error(`catalogue request failed: ${response.status}`);
  const payload = await response.json();
  const pick = pickLatestOpenAiCurationModel(payload?.data || []);
  const current = await readConfig();
  if (!pick) {
    console.log('[curation-model] no eligible OpenAI GPT model in the catalogue; keeping', current.model);
    return { changed: false, model: current.model, reason: 'no_candidate' };
  }
  console.log(`[curation-model] newest eligible: ${pick.id} (v${pick.version}); current: ${current.model || 'none'}; candidates: ${pick.candidates.slice(0, 6).map((c) => c.id).join(', ')}`);
  if (pick.id === current.model) {
    return { changed: false, model: current.model, reason: 'already_current' };
  }
  const check = await verifyModel(pick.id);
  if (!check.verified && check.reason !== 'no_api_key') {
    console.warn(`[curation-model] ${pick.id} failed verification (${check.reason}); keeping ${current.model}`);
    return { changed: false, model: current.model, reason: `verification_failed:${check.reason}` };
  }
  const next = {
    model: pick.id,
    version: pick.version,
    source: 'openrouter',
    checked_at: now.toISOString(),
    verified: check.verified,
    previous: current.model || null,
  };
  if (write) {
    await fs.writeFile(CONFIG_PATH, `${JSON.stringify(next, null, 2)}\n`);
  }
  console.log(`[curation-model] switched ${current.model || 'none'} -> ${pick.id}${check.verified ? ' (verified)' : ' (unverified: no API key)'}`);
  return { changed: true, model: pick.id, previous: current.model || null };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const result = await refreshCurationModel();
  console.log(JSON.stringify(result));
}
