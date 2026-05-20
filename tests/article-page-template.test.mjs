import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

test('article page template presents Compute Current blog analysis before source link', async () => {
  const template = await fs.readFile('src/pages/news/[id].astro', 'utf8');
  assert.match(template, /Compute Current Editorial Desk|publicArticle\.byline/);
  assert.match(template, /sourceAttribution/);
  assert.match(template, /PublicArticleBody/);
  assert.doesNotMatch(template, /Relevance Score|Urgency Score|Article Blueprint|Extraction Quality/);
});
