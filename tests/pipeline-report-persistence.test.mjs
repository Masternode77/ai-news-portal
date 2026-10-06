import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('Mac publication instructions preserve the taxonomy report with generated inventory', () => {
  const instructions = readFileSync(new URL('../docs/subscription-generation.md', import.meta.url), 'utf8');
  assert.match(instructions, /src\/data\/taxonomy-pages\.json/);
  assert.match(instructions, /docs\/taxonomy-pages-report\.md/);
  assert.match(instructions, /npm run content:gate/);
  const workflow = readFileSync(new URL('../.github/workflows/update-news.yml', import.meta.url), 'utf8');
  assert.doesNotMatch(workflow, /git push|contents: write/);
});
