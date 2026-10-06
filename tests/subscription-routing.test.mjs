import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { reviewColumnEvidence, generateAuthoredColumn } from '../scripts/lib/authored-column-engine.mjs';
import { fixtureArticle, FIXTURE_SOURCE, STANCE_JSON, essayJson } from './fixtures/authored-column-fixture.mjs';

function runIsolated(code, overrides = {}) {
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', code], {
    cwd: process.cwd(),
    env: { ...process.env, LLM_PROVIDER: 'subscription', PIPELINE_OFFLINE: '0', CODEX_SANDBOX_NETWORK_DISABLED: '0',
      SUBSCRIPTION_INCLUDED_USAGE_CONFIRMED: '0', ...overrides },
    encoding: 'utf8',
    timeout: 10_000,
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

test('subscription defaults ignore stale API model overrides', () => {
  const output = runIsolated(`
    import { LLM_PROVIDER, OPENROUTER_MODEL, CURATION_MODEL, EXPERT_LENS_MODEL, AUTHORED_COLUMN_MODEL } from './scripts/lib/constants.mjs';
    console.log(JSON.stringify([LLM_PROVIDER, OPENROUTER_MODEL, CURATION_MODEL, EXPERT_LENS_MODEL, AUTHORED_COLUMN_MODEL]));
  `, { OPENROUTER_MODEL: 'old-model', CURATION_MODEL: 'old-model', EXPERT_LENS_MODEL: 'old-model', AUTHORED_COLUMN_MODEL: 'old-model' });
  assert.deepEqual(JSON.parse(output), ['subscription', 'gpt-6-astra', 'gpt-6-astra', 'gpt-6-astra', 'claude-fable-5-1']);
});

test('offline and disabled providers never invoke a CLI or HTTP even with API credentials', () => {
  for (const env of [{ PIPELINE_OFFLINE: '1' }, { LLM_PROVIDER: 'disabled' }]) {
    const output = runIsolated(`
      import assert from 'node:assert/strict';
      import { callOpenRouterText, callOpenRouterJson, llmEnabled, assertLlmReady } from './scripts/lib/openrouter.mjs';
      globalThis.fetch = () => { throw new Error('Unexpected HTTP'); };
      await assertLlmReady();
      assert.equal(llmEnabled(), false);
      assert.equal(await callOpenRouterText({systemPrompt:'test', userPrompt:'test'}), '');
      assert.equal(await callOpenRouterJson({systemPrompt:'test', userPrompt:'test'}), null);
      console.log('offline');
    `, { ...env, OPENROUTER_API_KEY: 'fixture-not-a-key', SUBSCRIPTION_CODEX_BIN: 'must-not-execute' });
    assert.equal(output, 'offline');
  }
});

test('subscription failures propagate through text and expert-lens without API fallback', () => {
  assert.equal(runIsolated(`
    import assert from 'node:assert/strict';
    import { callOpenRouterText, callExpertLensText, llmEnabled } from './scripts/lib/openrouter.mjs';
    globalThis.fetch = () => { throw new Error('Unexpected HTTP fallback'); };
    assert.equal(llmEnabled(), true);
    for (const call of [callOpenRouterText, callExpertLensText]) {
      await assert.rejects(call({ systemPrompt:'test', userPrompt:'test' }), /SUBSCRIPTION_INCLUDED_USAGE_CONFIRMED/);
    }
    console.log('failed-closed');
  `, { OPENROUTER_API_KEY: 'fixture-not-a-key' }), 'failed-closed');
});

test('explicit legacy provider remains independently selectable without automatic subscription execution', () => {
  assert.equal(runIsolated(`
    import assert from 'node:assert/strict';
    import { callOpenRouterText } from './scripts/lib/openrouter.mjs';
    let calls=0;
    globalThis.fetch=async () => { calls++; return {ok:true,json:async()=>({choices:[{message:{content:'fixture'}}]})}; };
    assert.equal(await callOpenRouterText({systemPrompt:'test',userPrompt:'test'}),'fixture');
    assert.equal(calls,1);
    console.log('legacy-opt-in');
  `, { LLM_PROVIDER: 'openrouter', OPENROUTER_API_KEY: 'fixture-not-a-key' }), 'legacy-opt-in');
});

const essay = { headline: 'Acme expands', deck: 'Acme announced capacity.', body: 'Acme announced 200 MW of capacity.' };
const evidence = {
  primary_source: { url: 'https://example.com/source' },
  corroborating_sources: [],
  source_text: 'Acme announced 200 MW of capacity.',
  sources: [{ url: 'https://example.com/source', text: 'Acme announced 200 MW of capacity.' }],
  verified_claims: [],
};
const check = { claim: essay.body, source_url: evidence.primary_source.url, evidence_quote: evidence.source_text, supported: true };
const approved = { approved: true, issues: [], source_checks: [check], numeric_checks: [check] };

test('Astra cross-review accepts source-bound checks and uses its own task/model', async () => {
  let request;
  const review = await reviewColumnEvidence({ essay, evidence, callModel: async value => { request=value; return JSON.stringify(approved); } });
  assert.equal(request.model, 'gpt-6-astra');
  assert.equal(request.task, 'review');
  assert.equal(review.approved, true);
});

for (const [name, value] of [
  ['negative review', { ...approved, approved: false }],
  ['unresolved issues', { ...approved, issues: ['unsupported status'] }],
  ['missing source checks', { ...approved, source_checks: [] }],
  ['uncovered numbers', { ...approved, numeric_checks: [] }],
  ['invented source quote', { ...approved, source_checks: [{ ...check, evidence_quote: 'invented fact' }] }],
  ['wrong source attribution', { ...approved, source_checks: [{ ...check, source_url: 'https://example.com/other' }] }],
  ['claim absent from essay', { ...approved, source_checks: [{ ...check, claim: 'Acme is bankrupt' }] }],
  ['malformed response', 'not-json'],
]) {
  test('Astra cross-review rejects ' + name, async () => {
    await assert.rejects(reviewColumnEvidence({
      essay, evidence, callModel: async () => typeof value === 'string' ? value : JSON.stringify(value),
    }), /evidence review rejected/);
  });
}

test('rejected cross-review prevents a Fable draft from becoming a column', async () => {
  const oldWords=process.env.AUTHORED_MIN_WORDS;
  const oldChars=process.env.AUTHORED_MIN_CHARS;
  process.env.AUTHORED_MIN_WORDS='700';
  process.env.AUTHORED_MIN_CHARS='4200';
  const tasks=[];
  const state={};
  try {
    await assert.rejects(generateAuthoredColumn({
      candidates:[fixtureArticle()], sources:[FIXTURE_SOURCE], state,
      now:new Date('2026-08-23T09:00:00Z'),
      callModel:async request => { tasks.push(request.task); return tasks.length===1 ? STANCE_JSON : essayJson(); },
      reviewModel:async () => JSON.stringify({approved:false, issues:['source mismatch'], source_checks:[], numeric_checks:[]}),
    }), /evidence review rejected/);
    assert.deepEqual(tasks, ['column', 'column', 'column']);
    assert.equal(state.authored?.lastColumnAt, null);
  } finally {
    if(oldWords===undefined) delete process.env.AUTHORED_MIN_WORDS; else process.env.AUTHORED_MIN_WORDS=oldWords;
    if(oldChars===undefined) delete process.env.AUTHORED_MIN_CHARS; else process.env.AUTHORED_MIN_CHARS=oldChars;
  }
});

test('subscription enrichment rejects false, zero, arrays and incomplete objects', () => {
  assert.equal(runIsolated(`
    import assert from 'node:assert/strict';
    import { normalizeAiPayload } from './scripts/lib/content.mjs';
    for(const payload of [false,0,[],{},null]) {
      assert.throws(()=>normalizeAiPayload(payload,{}), /incomplete editorial fields/);
    }
    console.log('malformed-blocked');
  `), 'malformed-blocked');
});

test('a checked 2000 claim cannot cover a separate unchecked 200 claim', async () => {
  const reviewed = 'Acme announced 2000 MW of capacity.';
  const currentEssay = { ...essay, body: reviewed + ' A second site has 200 MW of capacity.' };
  const currentEvidence = { ...evidence, sources:[{url:evidence.primary_source.url,text:currentEssay.body}] };
  const currentCheck = { ...check, claim:reviewed, evidence_quote:reviewed };
  await assert.rejects(reviewColumnEvidence({
    essay:currentEssay,evidence:currentEvidence,
    callModel:async()=>JSON.stringify({...approved, source_checks:[currentCheck], numeric_checks:[currentCheck]}),
  }), /evidence review rejected/);
});
