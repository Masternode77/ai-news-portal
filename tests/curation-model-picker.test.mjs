import assert from 'node:assert/strict';
import test from 'node:test';
import { curationModelCandidates, pickLatestOpenAiCurationModel } from '../scripts/lib/curation-model-picker.mjs';

const catalogue = [
  { id: 'openai/gpt-5.6-luna-pro', created: 1760000300 },
  { id: 'openai/gpt-5.6-luna', created: 1760000300 },
  { id: 'openai/gpt-5.6-terra', created: 1760000200 },
  { id: 'openai/gpt-5.6-sol-pro', created: 1760000100 },
  { id: 'openai/gpt-5.6-sol', created: 1760000100 },
  { id: 'openai/gpt-5.6-sol:batch', created: 1760000100 },
  { id: 'openai/gpt-chat-latest', created: 1760000400 },
  { id: 'openai/gpt-5.5', created: 1750000000 },
  { id: 'openai/gpt-5.4-image-2', created: 1770000000 },
  { id: 'openai/gpt-5.4-mini', created: 1770000000 },
  { id: 'openai/gpt-5.3-codex', created: 1770000000 },
  { id: 'anthropic/claude-sonnet-4.5', created: 1780000000 },
  { id: 'openai/gpt-5.7', created: 1790000000, architecture: { modality: 'text+image->text' }, supported_parameters: ['response_format', 'temperature'] },
  { id: 'openai/gpt-5.7-audio', created: 1790000000 },
];

test('the highest GPT version wins, with the newest release breaking ties', () => {
  const pick = pickLatestOpenAiCurationModel(catalogue);
  assert.equal(pick.id, 'openai/gpt-5.7');
  const withoutFiveSeven = catalogue.filter((m) => !m.id.startsWith('openai/gpt-5.7'));
  assert.equal(pickLatestOpenAiCurationModel(withoutFiveSeven).id, 'openai/gpt-5.6-luna');
});

test('coding, media, size-reduced, pro, batch, and alias ids are never candidates', () => {
  const ids = curationModelCandidates(catalogue).map((c) => c.id);
  for (const excluded of ['openai/gpt-5.6-luna-pro', 'openai/gpt-5.6-sol:batch', 'openai/gpt-chat-latest', 'openai/gpt-5.4-image-2', 'openai/gpt-5.4-mini', 'openai/gpt-5.3-codex', 'openai/gpt-5.7-audio', 'anthropic/claude-sonnet-4.5']) {
    assert.equal(ids.includes(excluded), false, excluded);
  }
});

test('models that cannot return text or JSON are skipped', () => {
  const pick = pickLatestOpenAiCurationModel([
    { id: 'openai/gpt-6', created: 1, architecture: { modality: 'text->image' } },
    { id: 'openai/gpt-5.9', created: 1, supported_parameters: ['temperature'] },
    { id: 'openai/gpt-5.8', created: 1, supported_parameters: ['response_format'] },
  ]);
  assert.equal(pick.id, 'openai/gpt-5.8');
});

test('an empty catalogue yields no pick', () => {
  assert.equal(pickLatestOpenAiCurationModel([]), null);
});
