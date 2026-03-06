import {
  OPENROUTER_API_URL,
  OPENROUTER_APP_TITLE,
  OPENROUTER_MODEL,
  OPENROUTER_SITE_URL,
} from './constants.mjs';
import { safeJsonParse } from './normalize.mjs';

function buildHeaders(apiKey) {
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };
  if (OPENROUTER_SITE_URL) headers['HTTP-Referer'] = OPENROUTER_SITE_URL;
  if (OPENROUTER_APP_TITLE) headers['X-Title'] = OPENROUTER_APP_TITLE;
  return headers;
}

function extractContent(payload) {
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map((part) => part?.text || '').join('\n').trim();
  }
  return '';
}

export async function callOpenRouterJson({
  systemPrompt,
  userPrompt,
  temperature = 0.25,
  maxTokens = 900,
  timeoutMs = 30000,
}) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(OPENROUTER_API_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: buildHeaders(apiKey),
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        temperature,
        max_tokens: maxTokens,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenRouter request failed: ${response.status}`);
    }

    const payload = await response.json();
    const content = extractContent(payload);
    return safeJsonParse(content, null);
  } finally {
    clearTimeout(timeout);
  }
}
