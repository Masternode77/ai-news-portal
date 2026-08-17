import {
  EXPERT_LENS_FALLBACK_MODEL,
  OPENROUTER_API_URL,
  OPENROUTER_APP_TITLE,
  OPENROUTER_MODEL,
  OPENROUTER_SITE_URL,
  PIPELINE_OFFLINE,
} from './constants.mjs';
import { safeJsonParse } from './normalize.mjs';
import { assertLlmBudget, recordLlmCall, recordLlmFailure } from './llm-budget.mjs';

const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);
const RETRY_DELAYS_MS = [2_000, 8_000];

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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Model-side rejections (unknown model id, malformed request) are not
// retryable against the same model, but they are exactly the failures the
// fallback-model chain should catch — so they are flagged for the caller.
export function isModelNotAvailableError(error) {
  return error?.openrouterStatus === 400 || error?.openrouterStatus === 404;
}

async function requestOnce({ model, temperature, maxTokens, timeoutMs, systemPrompt, userPrompt, apiKey }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(OPENROUTER_API_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: buildHeaders(apiKey),
      body: JSON.stringify({
        model,
        temperature,
        max_tokens: maxTokens,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      const bodyText = await response.text().catch(() => '');
      const error = new Error(
        `OpenRouter request failed: ${response.status} model=${model} ${bodyText.slice(0, 220)}`
      );
      error.openrouterStatus = response.status;
      throw error;
    }

    const payload = await response.json();
    recordLlmCall(payload?.usage || {});
    return extractContent(payload);
  } finally {
    clearTimeout(timeout);
  }
}

export async function callOpenRouterText({
  systemPrompt,
  userPrompt,
  temperature = 0.25,
  maxTokens = 900,
  timeoutMs = 30000,
  model = OPENROUTER_MODEL,
}) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey || PIPELINE_OFFLINE) return '';

  assertLlmBudget();

  let lastError;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      return await requestOnce({ model, temperature, maxTokens, timeoutMs, systemPrompt, userPrompt, apiKey });
    } catch (error) {
      lastError = error;
      recordLlmFailure();
      const retryable = RETRYABLE_STATUS.has(error?.openrouterStatus) || error?.name === 'AbortError';
      if (!retryable || attempt === RETRY_DELAYS_MS.length) break;
      const delay = RETRY_DELAYS_MS[attempt];
      console.warn(`[openrouter] attempt ${attempt + 1} failed (${error.message}); retrying in ${delay}ms`);
      await sleep(delay);
    }
  }
  throw lastError;
}

export async function callOpenRouterJson(options) {
  const content = await callOpenRouterText(options);
  return safeJsonParse(content, null);
}

export async function callExpertLensText(options) {
  const primaryModel = options.model || process.env.EXPERT_LENS_MODEL || EXPERT_LENS_FALLBACK_MODEL;
  const fallbackModel = process.env.EXPERT_LENS_FALLBACK_MODEL || EXPERT_LENS_FALLBACK_MODEL;
  try {
    const content = await callOpenRouterText({ ...options, model: primaryModel });
    return content?.trim() || '';
  } catch (error) {
    console.warn(`[openrouter] expert-lens model ${primaryModel} failed: ${error.message}`);
    if (fallbackModel && fallbackModel !== primaryModel && isModelNotAvailableError(error)) {
      try {
        console.warn(`[openrouter] retrying expert-lens with fallback model ${fallbackModel}`);
        const content = await callOpenRouterText({ ...options, model: fallbackModel });
        return content?.trim() || '';
      } catch (fallbackError) {
        console.warn(`[openrouter] fallback model ${fallbackModel} failed: ${fallbackError.message}`);
      }
    }
    return '';
  }
}
