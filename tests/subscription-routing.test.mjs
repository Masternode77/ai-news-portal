import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { applyEditorialBlockEdits, EditorialReviewRejection, reviewColumnEvidence, generateAuthoredColumn, sourceSummaryRepairDiagnostics } from '../scripts/lib/authored-column-engine.mjs';
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

function approvedReviewForRequest(request) {
  const { essay: reviewedEssay, evidence: reviewedEvidence } = JSON.parse(request.userPrompt);
  const source = reviewedEvidence.sources[0];
  const reviewedText = [reviewedEssay.headline, reviewedEssay.deck, reviewedEssay.body].join('\n');
  const reviewedCheck = { claim: reviewedText, source_url: source.url, evidence_quote: source.text, supported: true };
  return JSON.stringify({ approved: true, issues: [], source_checks: [reviewedCheck], numeric_checks: [reviewedCheck] });
}

function metadataRepairPatch() {
  const current=JSON.parse(essayJson());
  return JSON.stringify({
    headline:current.headline,
    deck:current.deck.replace('I think','My view is that'),
    edits:[],
  });
}

test('targeted editorial patches preserve every unedited block byte-for-byte', () => {
  const input={
    headline:'A Source Bound Column Headline That Is Long Enough',
    deck:'A source-bound standfirst that is long enough for the column contract and precise about the reported evidence.',
    body:['Evidence First','The source supports this paragraph exactly.','The project paid for continuously without qualification.','Decision Point','Readers should watch the next filing.'].join('\n\n'),
  };
  const originalBlocks=input.body.split('\n\n');
  const repaired=applyEditorialBlockEdits(input,{
    headline:input.headline,
    deck:input.deck,
    edits:[{original:originalBlocks[2],replacement:'The source does not specify how the project is financed over time.'}],
  });
  const repairedBlocks=repaired.body.split('\n\n');
  assert.equal(repairedBlocks[2],'The source does not specify how the project is financed over time.');
  for(const index of [0,1,3,4]) assert.equal(repairedBlocks[index],originalBlocks[index]);
  assert.throws(()=>applyEditorialBlockEdits(input,{headline:input.headline,deck:input.deck,edits:[{original:'Fabricated block',replacement:'Replacement paragraph.'}]}),/unknown_editorial_patch_original/);
  const ambiguous={...input,body:['Repeated paragraph.','Repeated paragraph.','Decision Point'].join('\n\n')};
  assert.throws(()=>applyEditorialBlockEdits(ambiguous,{headline:ambiguous.headline,deck:ambiguous.deck,edits:[{original:'Repeated paragraph.',replacement:'One replacement paragraph.'}]}),/ambiguous_editorial_patch_original/);
  assert.throws(()=>applyEditorialBlockEdits(input,{headline:input.headline,deck:input.deck,edits:[{original:originalBlocks[1],replacement:'First replacement.'},{original:originalBlocks[1],replacement:'Second replacement.'}]}),/invalid_editorial_patch_edit/);
  assert.throws(()=>applyEditorialBlockEdits(input,{headline:input.headline,deck:input.deck,edits:[{original:originalBlocks[1],replacement:originalBlocks[1]}]}),/empty_editorial_patch/);
});

test('source-summary diagnostics identify measured sentences and exact repair blocks', () => {
  const source='The source reported the cluster added capacity. The source said the operator changed its schedule. The filing described the next milestone.';
  const body=['Evidence Recap','The source reported the cluster added capacity. The source said the operator changed its schedule.','Decision Test','Operators still need to compare the disclosed milestone with their own deployment criteria. The decision depends on evidence outside this source.'].join('\n\n');
  const diagnostics=sourceSummaryRepairDiagnostics(body,source);
  assert.ok(diagnostics.source_summary_ratio>0.35);
  assert.ok(diagnostics.excess_source_like_count>0);
  assert.equal(diagnostics.summary_heavy_blocks[0].block,body.split('\n\n')[1]);
  assert.match(diagnostics.summary_heavy_blocks[0].source_like_sentences[0].sentence,/source reported the cluster/);
});

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
  ['malformed numeric check', { ...approved, numeric_checks: [null] }],
  ['malformed response', 'not-json'],
]) {
  test('Astra cross-review rejects ' + name, async () => {
    await assert.rejects(reviewColumnEvidence({
      essay, evidence, callModel: async () => typeof value === 'string' ? value : JSON.stringify(value),
    }), /evidence review rejected/);
  });
}

test('rejected cross-review feedback repairs the voice and requires a fresh accepted review', async () => {
  const oldWords=process.env.AUTHORED_MIN_WORDS;
  const oldChars=process.env.AUTHORED_MIN_CHARS;
  process.env.AUTHORED_MIN_WORDS='700';
  process.env.AUTHORED_MIN_CHARS='4200';
  const tasks=[];
  const reviewRequests=[];
  const reviewIssues=Array.from({length:12},(_,index)=>`source mismatch ${index + 1}`);
  const unsupportedClaim='The developer waited two years in the interconnection queue before the utility granted a position, according to the filings.';
  const state={};
  try {
    const result = await generateAuthoredColumn({
      candidates:[fixtureArticle()], sources:[FIXTURE_SOURCE], state,
      now:new Date('2026-08-23T09:00:00Z'),
      callModel:async request => {
        tasks.push(request.task);
        if (tasks.length === 4) {
          assert.match(request.systemPrompt, /Astra review issue: source mismatch 12/);
          assert.match(request.systemPrompt, /headline at 40-105 characters/);
          assert.match(request.systemPrompt, /deck at 80-240 characters/);
          assert.match(request.systemPrompt, /Exact unverified claim to remove or correct against the source: "The developer waited two years/);
          return metadataRepairPatch();
        }
        return tasks.length===1 ? STANCE_JSON : essayJson();
      },
      reviewModel:async request => {
        reviewRequests.push(request);
        return reviewRequests.length === 1
          ? JSON.stringify({approved:false, issues:reviewIssues, source_checks:[{claim:unsupportedClaim,source_url:'https://example.com/northline-dakota',evidence_quote:'',supported:false}], numeric_checks:[]})
          : approvedReviewForRequest(request);
      },
    });
    assert.ok(result.column);
    assert.deepEqual(tasks, ['column', 'column', 'column', 'column']);
    assert.equal(reviewRequests.length, 2);
    assert.equal(result.column.authored_quality.cross_review.approved, true);
  } finally {
    if(oldWords===undefined) delete process.env.AUTHORED_MIN_WORDS; else process.env.AUTHORED_MIN_WORDS=oldWords;
    if(oldChars===undefined) delete process.env.AUTHORED_MIN_CHARS; else process.env.AUTHORED_MIN_CHARS=oldChars;
  }
});

test('a second Astra rejection opens one final whole-draft scope audit and fresh review', async () => {
  const oldWords=process.env.AUTHORED_MIN_WORDS;
  const oldChars=process.env.AUTHORED_MIN_CHARS;
  process.env.AUTHORED_MIN_WORDS='700';
  process.env.AUTHORED_MIN_CHARS='4200';
  const tasks=[];
  const reviewRequests=[];
  try {
    const result=await generateAuthoredColumn({
      candidates:[fixtureArticle()], sources:[FIXTURE_SOURCE], state:{},
      now:new Date('2026-08-23T09:00:00Z'),
      callModel:async request=>{
        tasks.push(request.task);
        if(tasks.length===1) return STANCE_JSON;
        if(tasks.length===4){
          assert.doesNotMatch(request.systemPrompt,/prior targeted repair left unsupported claims/i);
          const current=JSON.parse(request.userPrompt);
          return JSON.stringify({headline:current.headline,deck:current.deck.replace('I think','My view is that'),edits:[]});
        }
        if(tasks.length===5){
          assert.match(request.systemPrompt,/prior targeted repair left unsupported claims/i);
          assert.match(request.systemPrompt,/Audit the entire headline, deck, and body/);
          assert.match(request.systemPrompt,/avoid universal performance or economic claims/);
          const current=JSON.parse(request.userPrompt);
          return JSON.stringify({headline:current.headline,deck:current.deck.replace('My view is that','My assessment is that'),edits:[]});
        }
        return essayJson();
      },
      reviewModel:async request=>{
        reviewRequests.push(request);
        if(reviewRequests.length===1) return JSON.stringify({approved:false,issues:['unsupported benchmark scope'],source_checks:[],numeric_checks:[]});
        if(reviewRequests.length===2) return JSON.stringify({approved:false,issues:['related universal performance claim remains'],source_checks:[],numeric_checks:[]});
        return approvedReviewForRequest(request);
      },
    });
    assert.ok(result.column);
    assert.deepEqual(tasks,['column','column','column','column','column']);
    assert.equal(reviewRequests.length,3);
    assert.equal(result.column.authored_quality.attempts,3);
  } finally {
    if(oldWords===undefined) delete process.env.AUTHORED_MIN_WORDS; else process.env.AUTHORED_MIN_WORDS=oldWords;
    if(oldChars===undefined) delete process.env.AUTHORED_MIN_CHARS; else process.env.AUTHORED_MIN_CHARS=oldChars;
  }
});

test('deterministic repairs and Astra repair use separate bounded voice budgets', async () => {
  const oldWords=process.env.AUTHORED_MIN_WORDS;
  const oldChars=process.env.AUTHORED_MIN_CHARS;
  process.env.AUTHORED_MIN_WORDS='700';
  process.env.AUTHORED_MIN_CHARS='4200';
  const tasks=[];
  const reviewRequests=[];
  const state={};
  const currentEssay=JSON.parse(essayJson());
  const originalBlock=currentEssay.body.split('\n\n')[1];
  const unsupportedBlock=`${originalBlock} The source also guarantees 999 MW of continuous capacity.`;
  const badQuality=JSON.stringify({
    headline:'This Headline Is Long Enough To Clear The Basic Title Gate',
    deck:'This standfirst is deliberately long enough to pass basic parsing while its body still fails deterministic publication quality.',
    body:'One tiny paragraph that cannot pass the deterministic column quality gates.',
  });
  try {
    const result = await generateAuthoredColumn({
      candidates:[fixtureArticle()], sources:[FIXTURE_SOURCE], state,
      now:new Date('2026-08-23T09:00:00Z'),
      callModel:async request => {
        tasks.push(request.task);
        if (tasks.length === 6) {
          assert.match(request.systemPrompt, /Astra review issue: unsupported causal claim/);
          assert.match(request.systemPrompt, /Remove or rewrite around these numbers/);
          return JSON.stringify({headline:currentEssay.headline,deck:currentEssay.deck,edits:[{original:unsupportedBlock,replacement:originalBlock}]});
        }
        if (tasks.length === 1) return STANCE_JSON;
        if (tasks.length === 3) return badQuality;
        if (tasks.length === 5) return JSON.stringify({headline:currentEssay.headline,deck:currentEssay.deck,edits:[{original:originalBlock,replacement:unsupportedBlock}]});
        return essayJson();
      },
      reviewModel:async request => {
        reviewRequests.push(request);
        return reviewRequests.length === 1
          ? JSON.stringify({approved:false, issues:['unsupported causal claim'], source_checks:[], numeric_checks:[]})
          : approvedReviewForRequest(request);
      },
    });
    assert.ok(result.column);
    assert.deepEqual(tasks, ['column','column','column','column','column','column']);
    assert.equal(reviewRequests.length,2);
    assert.equal(result.column.authored_quality.attempts,4);
  } finally {
    if(oldWords===undefined) delete process.env.AUTHORED_MIN_WORDS; else process.env.AUTHORED_MIN_WORDS=oldWords;
    if(oldChars===undefined) delete process.env.AUTHORED_MIN_CHARS; else process.env.AUTHORED_MIN_CHARS=oldChars;
  }
});

test('targeted retry receives exact summary-heavy blocks from the current patched draft', async () => {
  const oldWords=process.env.AUTHORED_MIN_WORDS;
  const oldChars=process.env.AUTHORED_MIN_CHARS;
  process.env.AUTHORED_MIN_WORDS='700';
  process.env.AUTHORED_MIN_CHARS='4200';
  const currentEssay=JSON.parse(essayJson());
  const blocks=currentEssay.body.split('\n\n');
  const paragraphIndexes=blocks.map((block,index)=>({block,index})).filter(({block})=>block.length>100).slice(0,4);
  const sourceSentences=fixtureArticle().articleText.split(/(?<=[.!?])\s+/);
  const summaryEdits=paragraphIndexes.map(({block},index)=>({original:block,replacement:`${block} ${sourceSentences.slice(index,index+4).join(' ')}`}));
  const restoreEdits=summaryEdits.map((edit)=>({original:edit.replacement,replacement:edit.original}));
  const tasks=[];
  let reviewCalls=0;
  try {
    const result=await generateAuthoredColumn({
      candidates:[fixtureArticle()], sources:[FIXTURE_SOURCE], state:{},
      now:new Date('2026-08-23T09:00:00Z'),
      callModel:async request=>{
        tasks.push(request.task);
        if(tasks.length===1) return STANCE_JSON;
        if(tasks.length===4){
          assert.match(request.systemPrompt,/Do not increase the source-like count while making this repair/);
          const payload=JSON.parse(request.userPrompt);
          assert.ok(payload.source_summary_diagnostics.source_summary_ratio<=0.35);
          assert.ok(payload.source_summary_diagnostics.summary_heavy_blocks.length>0);
          return JSON.stringify({headline:currentEssay.headline,deck:currentEssay.deck,edits:summaryEdits});
        }
        if(tasks.length===5){
          assert.match(request.systemPrompt,/current body measures \d+ source-like sentences/);
          assert.match(request.systemPrompt,/Current deterministic failures on this exact draft:.*Reduce the space spent retelling/);
          const payload=JSON.parse(request.userPrompt);
          assert.ok(payload.source_summary_diagnostics.source_summary_ratio>0.35);
          assert.ok(payload.source_summary_diagnostics.excess_source_like_count>0);
          assert.ok(payload.source_summary_diagnostics.summary_heavy_blocks.some((entry)=>entry.block===summaryEdits[0].replacement));
          return JSON.stringify({headline:currentEssay.headline,deck:currentEssay.deck,edits:restoreEdits});
        }
        return essayJson();
      },
      reviewModel:async request=>{
        reviewCalls+=1;
        return reviewCalls===1
          ? JSON.stringify({approved:false,issues:['remove unsupported recap'],source_checks:[],numeric_checks:[]})
          : approvedReviewForRequest(request);
      },
    });
    assert.ok(result.column);
    assert.deepEqual(tasks,['column','column','column','column','column']);
    assert.equal(reviewCalls,2);
  } finally {
    if(oldWords===undefined) delete process.env.AUTHORED_MIN_WORDS; else process.env.AUTHORED_MIN_WORDS=oldWords;
    if(oldChars===undefined) delete process.env.AUTHORED_MIN_CHARS; else process.env.AUTHORED_MIN_CHARS=oldChars;
  }
});

test('repeated cross-review rejection prevents a Fable draft from becoming a column', async () => {
  const oldWords=process.env.AUTHORED_MIN_WORDS;
  const oldChars=process.env.AUTHORED_MIN_CHARS;
  process.env.AUTHORED_MIN_WORDS='700';
  process.env.AUTHORED_MIN_CHARS='4200';
  const tasks=[];
  let reviewCalls=0;
  const state={};
  try {
    await assert.rejects(generateAuthoredColumn({
      candidates:[fixtureArticle()], sources:[FIXTURE_SOURCE], state,
      now:new Date('2026-08-23T09:00:00Z'),
      callModel:async request => {
        tasks.push(request.task);
        if(tasks.length===1) return STANCE_JSON;
        if(tasks.length===4 || tasks.length===5) {
          const current=JSON.parse(request.userPrompt);
          const deck=tasks.length===4
            ? current.deck.replace('I think','My view is that')
            : current.deck.replace('My view is that','My assessment is that');
          return JSON.stringify({headline:current.headline,deck,edits:[]});
        }
        return essayJson();
      },
      reviewModel:async () => { reviewCalls += 1; return JSON.stringify({approved:false, issues:['source mismatch'], source_checks:[], numeric_checks:[]}); },
    }), (error) => error instanceof EditorialReviewRejection && /source mismatch/.test(error.message));
    assert.deepEqual(tasks, ['column', 'column', 'column', 'column', 'column']);
    assert.equal(reviewCalls,3);
    assert.equal(state.authored?.lastColumnAt, null);
  } finally {
    if(oldWords===undefined) delete process.env.AUTHORED_MIN_WORDS; else process.env.AUTHORED_MIN_WORDS=oldWords;
    if(oldChars===undefined) delete process.env.AUTHORED_MIN_CHARS; else process.env.AUTHORED_MIN_CHARS=oldChars;
  }
});

test('three rejected editorial versions stop after at most six voice attempts and three reviews', async () => {
  const oldWords=process.env.AUTHORED_MIN_WORDS;
  const oldChars=process.env.AUTHORED_MIN_CHARS;
  process.env.AUTHORED_MIN_WORDS='700';
  process.env.AUTHORED_MIN_CHARS='4200';
  const tasks=[];
  let reviewCalls=0;
  const currentEssay=JSON.parse(essayJson());
  const originalBlock=currentEssay.body.split('\n\n')[1];
  const unsupportedBlock=`${originalBlock} The source guarantees 999 MW without any conditions.`;
  const badQuality=JSON.stringify({
    headline:'This Headline Is Long Enough To Clear The Basic Title Gate',
    deck:'This standfirst is deliberately long enough to parse while the body fails deterministic publication quality.',
    body:'Too short to clear the deterministic article quality gates.',
  });
  try {
    await assert.rejects(generateAuthoredColumn({
      candidates:[fixtureArticle()], sources:[FIXTURE_SOURCE], state:{},
      now:new Date('2026-08-23T09:00:00Z'),
      callModel:async request=>{
        tasks.push(request.task);
        if(tasks.length===1) return STANCE_JSON;
        if(tasks.length===2 || tasks.length===4) return essayJson();
        if(tasks.length===3) return badQuality;
        if(tasks.length===5 || tasks.length===7){
          if(tasks.length===7) assert.match(request.systemPrompt,/prior targeted repair left unsupported claims/i);
          return JSON.stringify({headline:currentEssay.headline,deck:currentEssay.deck,edits:[{original:originalBlock,replacement:unsupportedBlock}]});
        }
        if(tasks.length===6 || tasks.length===8){
          return JSON.stringify({headline:currentEssay.headline,deck:currentEssay.deck,edits:[{original:unsupportedBlock,replacement:originalBlock}]});
        }
        throw new Error(`unexpected model call ${tasks.length}`);
      },
      reviewModel:async()=>{
        reviewCalls+=1;
        return JSON.stringify({approved:false,issues:[`review rejection ${reviewCalls}`],source_checks:[],numeric_checks:[]});
      },
    }),error=>error instanceof EditorialReviewRejection && /review rejection 3/.test(error.message));
    assert.deepEqual(tasks,['column','column','column','column','column','column','column','column']);
    assert.equal(reviewCalls,3);
  } finally {
    if(oldWords===undefined) delete process.env.AUTHORED_MIN_WORDS; else process.env.AUTHORED_MIN_WORDS=oldWords;
    if(oldChars===undefined) delete process.env.AUTHORED_MIN_CHARS; else process.env.AUTHORED_MIN_CHARS=oldChars;
  }
});

test('cross-review transport failures propagate without a Fable retry', async () => {
  const oldWords=process.env.AUTHORED_MIN_WORDS;
  const oldChars=process.env.AUTHORED_MIN_CHARS;
  process.env.AUTHORED_MIN_WORDS='700';
  process.env.AUTHORED_MIN_CHARS='4200';
  const tasks=[];
  const transportError=new Error('subscription transport unavailable');
  try {
    await assert.rejects(generateAuthoredColumn({
      candidates:[fixtureArticle()], sources:[FIXTURE_SOURCE], state:{},
      now:new Date('2026-08-23T09:00:00Z'),
      callModel:async request => { tasks.push(request.task); return tasks.length===1 ? STANCE_JSON : essayJson(); },
      reviewModel:async () => { throw transportError; },
    }), (error) => error === transportError);
    assert.deepEqual(tasks, ['column', 'column', 'column']);
  } finally {
    if(oldWords===undefined) delete process.env.AUTHORED_MIN_WORDS; else process.env.AUTHORED_MIN_WORDS=oldWords;
    if(oldChars===undefined) delete process.env.AUTHORED_MIN_CHARS; else process.env.AUTHORED_MIN_CHARS=oldChars;
  }
});

test('deterministic quality exhaustion stays bounded at two voice attempts even with a reviewer', async () => {
  const oldWords=process.env.AUTHORED_MIN_WORDS;
  const oldChars=process.env.AUTHORED_MIN_CHARS;
  process.env.AUTHORED_MIN_WORDS='700';
  process.env.AUTHORED_MIN_CHARS='4200';
  const tasks=[];
  let reviewCalls=0;
  const state={};
  try {
    const result=await generateAuthoredColumn({
      candidates:[fixtureArticle()], sources:[FIXTURE_SOURCE], state,
      now:new Date('2026-08-23T09:00:00Z'),
      callModel:async request => {
        tasks.push(request.task);
        if(tasks.length===1) return STANCE_JSON;
        if(tasks.length===2) return essayJson();
        return JSON.stringify({headline:'A Valid Looking Headline That Still Has No Essay',deck:'A sufficiently long deck that parses but cannot compensate for an invalid body.',body:'Too short.'});
      },
      reviewModel:async()=>{ reviewCalls+=1; return JSON.stringify(approved); },
    });
    assert.equal(result.column,null);
    assert.match(result.failure,/^verify:/);
    assert.deepEqual(tasks,['column','column','column','column']);
    assert.equal(reviewCalls,0);
    assert.equal(state.authored?.lastColumnAt,null);
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

test('subscription enrichment requires full taxonomy and keeps only generated fields', () => {
  assert.equal(runIsolated(`
    import assert from 'node:assert/strict';
    import { normalizeAiPayload } from './scripts/lib/content.mjs';
    const fallback={summary:'fallback summary',insight:'fallback insight',tags:['fallback'],region:'Fallback',imagePrompt:'fallback prompt'};
    const complete={
      summary:'Model summary', insight:'Model insight', primary_category:'Power & Grid',
      secondary_category:'Grid interconnection', infrastructure_layer:'Power',
      affected_stakeholders:['utilities'], article_type:'Capacity Expansion', region:'US',
      urgency_score:0.8, tags:['grid'], imagePrompt:'Model image prompt',
    };
    for(const payload of [
      {summary:'Model summary',insight:'Model insight',tags:[],imagePrompt:'Model prompt'},
      {...complete,primary_category:'Invented category'},
      {...complete,infrastructure_layer:'invalid'},
      {...complete,article_type:'invalid'},
      {...complete,urgency_score:'0.8'},
      {...complete,affected_stakeholders:'utilities'},
    ]) assert.throws(()=>normalizeAiPayload(payload,fallback), /incomplete editorial fields/);
    const normalized=normalizeAiPayload(complete,fallback);
    assert.deepEqual(normalized.tags,['grid']);
    assert.equal(normalized.region,'US');
    assert.deepEqual(normalized.taxonomy.affected_stakeholders,['utilities']);
    console.log('full-schema-enforced');
  `), 'full-schema-enforced');
});

test('legacy and offline enrichment retain deterministic completion behavior', () => {
  for (const overrides of [{ LLM_PROVIDER:'openrouter' }, { PIPELINE_OFFLINE:'1' }]) {
    assert.equal(runIsolated(`
      import assert from 'node:assert/strict';
      import { normalizeAiPayload } from './scripts/lib/content.mjs';
      const fallback={summary:'fallback summary',insight:'fallback insight',tags:['fallback'],region:'Global',imagePrompt:'fallback prompt'};
      const normalized=normalizeAiPayload({summary:'legacy summary',insight:'legacy insight',tags:[],imagePrompt:'legacy prompt'},fallback);
      assert.deepEqual(normalized.tags,['fallback']);
      assert.equal(normalized.region,'Global');
      console.log('legacy-completed');
    `, overrides), 'legacy-completed');
  }
});

test('subscription long-form rejects partial and banned generated payloads before normalization fallback', () => {
  assert.equal(runIsolated(`
    import assert from 'node:assert/strict';
    import { assertCompleteSubscriptionExpertLensPayload } from './scripts/lib/expert-lens.mjs';
    const article={
      title:'Northline Power lands 200 MW grid deal', article_blueprint:'constraint-ledger', sourceUrl:'https://example.com/source',
      expert_insight:{
        concrete_facts:['Northline Power secured 200 MW'], named_companies:['Northline Power'],
        infrastructure_layer:'Power', bottleneck_type:'grid_interconnection',
        who_gains_leverage:'utilities with spare capacity', who_takes_execution_risk:'developers with delivery dates',
        timing_dependency:'substation completion before 2027', counterargument:'the queue position could still slip',
        next_observable_signal:'substation construction milestones', expert_insight_complete:true,
      },
    };
    const detail='Northline Power secured 200 MW while grid interconnection in the Power layer remains the bottleneck. Utilities with spare capacity gain leverage, developers with delivery dates carry execution risk, and substation completion before 2027 controls timing. The queue position could still slip, so readers should track substation construction milestones and utility acceptance tests before treating contracted demand as operating capacity.';
    const finalArticleBody=['Change',detail.repeat(2),'Infrastructure Read',detail,'Exposed Edges',detail,'Decision Point',detail].join('\\n\\n');
    const complete={
      blueprintId:'constraint-ledger', generation_version:'editorial_surface_v2', narrative_dna:{
        protagonist:'Northline Power', antagonist_or_constraint:'Utility delivery risk',
        core_tension:'Contracted demand depends on unfinished grid work', reader_role:['operators','investors'],
        infrastructure_layer:'Power', time_horizon:'through energization', story_archetype:'Power Market Signal',
        hook_style:'constraint-led', evidence_anchor:'Northline Power secured 200 MW',
        counterpoint:'The queue position may hold', next_observable_signal:'Substation construction milestones',
      },
      dynamicBriefLabel:'Core Signal', thesis:'Northline Power depends on utility delivery', whatHappened:'Northline Power secured 200 MW',
      whyThisMatters:'Grid timing now controls commissioning', marketMissing:'Utility acceptance remains open',
      investors:'Investors should track the energization schedule', operators:'Operators carry commissioning exposure',
      hyperscalers:'Cloud buyers depend on delivered capacity', watchNext:'Track substation construction milestones',
      executiveSummary:['Northline secured capacity','Grid delivery controls timing','Watch utility acceptance'],
      headlineOptions:['Northline secures 200 MW','The grid controls Dakota timing','Utility work sets the clock','Dakota waits on power','The substation is the milestone'],
      finalHeadline:'Northline secures 200 MW as utility work sets the clock', metaDescription:'The Dakota campus now depends on substation delivery and utility acceptance.',
      finalArticleBody, sourceLink:'https://example.com/source',
    };
    assert.doesNotThrow(()=>assertCompleteSubscriptionExpertLensPayload(article,complete));
    const rephrasedBody=['Reported Change',detail.repeat(2),'Infrastructure Constraint',detail,'Exposed Stakeholders',detail,'Decision Signal',detail].join('\\n\\n');
    assert.doesNotThrow(()=>assertCompleteSubscriptionExpertLensPayload(article,{...complete,finalArticleBody:rephrasedBody}));
    for (const payload of [
      {finalHeadline:'A complete-looking headline',finalArticleBody:'A complete-looking body'},
      {...complete,narrative_dna:{...complete.narrative_dna,hook_style:''}},
      {...complete,narrative_dna:{...complete.narrative_dna,reader_role:'operators'}},
      {...complete,dynamicBriefLabel:'Invalid label'},
      {...complete,sourceLink:'https://attacker.example/fabricated-source'},
      {...complete,executiveSummary:['Only one line']},
      {...complete,thesis:'This signal matters for operators'},
      {...complete,finalArticleBody:'This signal matters for operators.'},
    ]) assert.throws(
      ()=>assertCompleteSubscriptionExpertLensPayload(article,payload),
      /incomplete or invalid editorial fields/
    );
    console.log('longform-fallback-blocked');
  `), 'longform-fallback-blocked');
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
