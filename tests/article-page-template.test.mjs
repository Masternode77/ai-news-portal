import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

test('article page template presents Compute Current blog analysis before source link', async () => {
  const template = await fs.readFile('src/pages/news/[id].astro', 'utf8');
  const header = await fs.readFile('src/components/ArticleHeader.astro', 'utf8');
  assert.match(header, /Compute Current Editorial Desk/);
  assert.match(template, /ArticleHeader/);
  assert.match(template, /ArticleBody/);
  assert.match(template, /SourceAttribution/);
  assert.match(template, /AIDisclosureFooter/);
  assert.doesNotMatch(template, /Relevance Score|Urgency Score|Article Blueprint|Extraction Quality/);
});
