import test from 'node:test';
import assert from 'node:assert/strict';

import { parseHomepageCards } from '../scripts/audit-public-content-quality.mjs';

test('public content audit reads list-card identity, lane, and deck text', () => {
  const html = `
    <article class="article-list-card" data-public-card data-article-id="signal-1" data-lane="power-grid">
      <h3>Grid interconnection queue reform</h3>
      <p class="article-deck">ERCOT's transmission plan changes the energization path for new data centers.</p>
    </article>
  `;

  assert.deepEqual(parseHomepageCards(html).map(({ id, lane, deck }) => ({ id, lane, deck })), [
    {
      id: 'signal-1',
      lane: 'power-grid',
      deck: "ERCOT's transmission plan changes the energization path for new data centers.",
    },
  ]);
});
