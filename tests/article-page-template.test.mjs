import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

test('article page template presents Compute Current blog analysis before source link', async () => {
  const template = await fs.readFile('src/pages/news/[id].astro', 'utf8');
  assert.match(template, /Compute Current Editorial Desk/);
  assert.match(template, /SourceAttribution/);
  assert.match(template, /BlogArticleBody/);
  assert.doesNotMatch(template, /Relevance Score|Urgency Score|Article Blueprint|Extraction Quality/);
});
