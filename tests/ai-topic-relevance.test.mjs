import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyAiTopicRelevance, classifyInfrastructureRelevance } from '../scripts/lib/relevance-classifier.mjs';
import { columnStoryRelevance, selectColumnStory } from '../scripts/lib/authored-column-engine.mjs';
import { fixtureArticle } from './fixtures/authored-column-fixture.mjs';

const modelLaunch = {
  title: 'OpenAI releases GPT-5.6 Sol with a 2 million token context window',
  snippet: 'The frontier model ships to API customers this week with new agentic tooling.',
  articleText: 'OpenAI said the large language model was trained on a new cluster and will be priced per million tokens. The lab claims inference costs fell 40 percent versus the prior generation. Anthropic and Google DeepMind are expected to respond within the quarter.',
  source: 'Example Wire',
  url: 'https://example.com/openai-sol',
};

test('an AI model launch scores as an AI-lane story even with weak infrastructure signal', () => {
  const ai = classifyAiTopicRelevance(modelLaunch);
  const infra = classifyInfrastructureRelevance(modelLaunch);
  assert.ok(ai.ai_topic_score >= 0.75, `expected AI lane >= 0.75, got ${ai.ai_topic_score}`);
  assert.ok(infra.infrastructure_relevance_score < 0.75, 'the wire gate must stay infrastructure-only');
  assert.ok(ai.ai_topic_reasons.includes('openai'));
});

test('a grid story that mentions AI in passing does not enter the AI lane', () => {
  const grid = {
    title: 'Energy Secretary keeps the Mid-Atlantic powered during hot weather',
    articleText: 'The emergency order directs PJM to dispatch units as needed. DOE estimates 35 GW of backup generation remains available, some of it near AI data center clusters.',
  };
  const ai = classifyAiTopicRelevance(grid);
  assert.ok(ai.ai_topic_score < 0.75, `got ${ai.ai_topic_score}`);
  assert.ok(ai.ai_topic_reasons.includes('ai_not_in_title'));
});

test('consumer AI app news without model or infrastructure context is capped', () => {
  const app = {
    title: 'New AI photo app lets users restyle selfies',
    articleText: 'The consumer app adds an image generator and a writing assistant for captions. It is free with ads.',
  };
  assert.ok(classifyAiTopicRelevance(app).ai_topic_score <= 0.5);
});

test('the column selector accepts an AI-lane story that clears the floor on that lane alone', () => {
  const aiStory = fixtureArticle({
    id: 'ai-001',
    title: 'OpenAI releases GPT-5.6 Sol with a 2 million token context window',
    infrastructure_relevance_score: 0.31,
    ai_topic_score: 0.9,
  });
  assert.equal(columnStoryRelevance(aiStory), 0.9);
  const selected = selectColumnStory({ candidates: [aiStory], pool: [] });
  assert.equal(selected?.article?.id, 'ai-001');
});

test('the column selector still rejects a story weak on both lanes', () => {
  const weak = fixtureArticle({ id: 'weak', infrastructure_relevance_score: 0.5, ai_topic_score: 0.4 });
  assert.equal(selectColumnStory({ candidates: [weak], pool: [] }), null);
});

test('columnStoryRelevance derives the AI lane when a record predates the field', () => {
  const legacy = fixtureArticle({ id: 'legacy', infrastructure_relevance_score: 0.2, title: modelLaunch.title, articleText: modelLaunch.articleText, contentText: modelLaunch.articleText, cleaned_source_text: modelLaunch.articleText });
  delete legacy.ai_topic_score;
  assert.ok(columnStoryRelevance(legacy) >= 0.75);
});
