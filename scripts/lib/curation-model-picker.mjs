// Picks the newest general-purpose OpenAI GPT text model from an OpenRouter
// model catalogue. Curation needs a reasoning-capable chat model that answers
// in JSON, so coding, audio, image, realtime, and size-reduced variants are
// excluded, as are "pro" tiers (cost) and batch endpoints.

const EXCLUDED_ID_PATTERN = /codex|audio|image|realtime|search|transcribe|tts|instruct|chat-latest|-chat\b|-mini\b|-nano\b|-pro\b|:batch|:free|:extended|:online|:nitro|:exacto/i;
const OPENAI_GPT_PATTERN = /^openai\/gpt-(\d+(?:\.\d+)?)(?:-|$)/i;

function textToText(model = {}) {
  const arch = model.architecture || {};
  if (typeof arch.modality === 'string') return /text->text|text\+.*->text/i.test(arch.modality);
  const inputs = arch.input_modalities || [];
  const outputs = arch.output_modalities || [];
  if (inputs.length || outputs.length) return inputs.includes('text') && outputs.includes('text');
  return true;
}

function supportsJsonMode(model = {}) {
  const params = model.supported_parameters;
  if (!Array.isArray(params) || !params.length) return true;
  return params.includes('response_format') || params.includes('structured_outputs');
}

export function curationModelCandidates(models = []) {
  return models
    .filter((model) => typeof model?.id === 'string')
    .map((model) => {
      const match = model.id.match(OPENAI_GPT_PATTERN);
      if (!match) return null;
      if (EXCLUDED_ID_PATTERN.test(model.id)) return null;
      if (!textToText(model) || !supportsJsonMode(model)) return null;
      return {
        id: model.id,
        version: Number(match[1]),
        created: Number(model.created) || 0,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.version - a.version || b.created - a.created || a.id.length - b.id.length || a.id.localeCompare(b.id));
}

export function pickLatestOpenAiCurationModel(models = []) {
  const candidates = curationModelCandidates(models);
  return candidates[0] ? { ...candidates[0], candidates } : null;
}
