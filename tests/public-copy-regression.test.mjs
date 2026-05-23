import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { findInternalLanguageHits } from '../scripts/lib/internal-language-guard.mjs';

test('public component and page source has no internal reader-facing phrases', () => {
  const paths = [
    'src/pages/index.astro',
    'src/pages/archive/index.astro',
    'src/pages/category/[slug].astro',
    'src/pages/news/[id].astro',
    'src/components/ArticleListCard.astro',
    'src/components/LatestAnalysisFeed.astro',
  ].filter((file) => fs.existsSync(file));

  const hits = findInternalLanguageHits(paths.map((file) => ({
    path: `/${file}`,
    surface: 'source',
    text: fs.readFileSync(file, 'utf8'),
  })));

  assert.deepEqual(hits, []);
});
