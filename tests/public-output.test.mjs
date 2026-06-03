import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { auditRenderedPublicOutput } from '../scripts/lib/rendered-output-audit.mjs';

async function fixtureDist(files = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'rendered-public-'));
  for (const [name, body] of Object.entries(files)) {
    const filePath = path.join(dir, name);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, body, 'utf8');
  }
  return dir;
}

const cleanLongform = `${'Power contracts, cooling lead times, network gear, and storage controls shape the AI infrastructure delivery window. '.repeat(55)}Final sentence complete.`;

test('rendered public output audit passes clean built pages', async () => {
  const distDir = await fixtureDist({
    'index.html': '<main><article data-public-card data-article-id="a1"><img src="/generated/fallbacks/ai-infrastructure.svg"><p class="signal-deck">Power delivery is the practical constraint for this deployment.</p></article></main>',
    'archive/index.html': '<main><article data-public-card data-article-id="a2"><img src="/generated/fallbacks/ai-infrastructure.svg"><p class="signal-deck">Cooling availability decides how quickly racks can be filled.</p></article></main>',
    'news/a1/index.html': `<main><article><section class="detail-article-copy"><p>${cleanLongform}</p></section><img src="/generated/fallbacks/ai-infrastructure.svg"></article></main>`,
    'rss.xml': '<rss><channel><item><link>https://www.computecurrent.com/news/a1/</link></item></channel></rss>',
    'sitemap.xml': '<urlset><url><loc>https://www.computecurrent.com/news/a1/</loc></url></urlset>',
    'generated/fallbacks/ai-infrastructure.svg': '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
  });

  const result = await auditRenderedPublicOutput({ distDir, articleLimit: 50, minLongformCharacters: 4500 });

  assert.equal(result.ok, true);
  assert.equal(result.counts.articlePages, 1);
  assert.equal(result.counts.brokenImages, 0);
});

test('rendered public output audit catches stale copy, repeated decks, broken images, and short longform', async () => {
  const distDir = await fixtureDist({
    'index.html': '<main><article data-public-card data-article-id="a1"><img src="/generated/missing.webp"><p class="signal-deck">The next signal to watch is customer commitments.</p></article><article data-public-card data-article-id="a2"><p class="signal-deck">The next signal to watch is customer commitments.</p></article></main>',
    'archive/index.html': '<main>Archive</main>',
    'news/a1/index.html': `<main><section class="detail-article-copy"><h2>Editor's Brief</h2><p>Short body with clo.</p></section><img src="/generated/missing.webp"></main>`,
    'rss.xml': `<rss><channel><item><title>Editor's Brief</title></item></channel></rss>`,
    'sitemap.xml': '<urlset><url><loc>https://www.computecurrent.com/news/a1/</loc></url></urlset>',
  });

  const result = await auditRenderedPublicOutput({ distDir, articleLimit: 50, minLongformCharacters: 4500 });

  assert.equal(result.ok, false);
  assert.ok(result.failures.some((failure) => failure.includes('forbidden phrase')));
  assert.ok(result.failures.some((failure) => failure.includes('duplicate deck prefix')));
  assert.ok(result.failures.some((failure) => failure.includes('broken image')));
  assert.ok(result.failures.some((failure) => failure.includes('longform below')));
});

test('rendered public output audit catches repeated article card decks', async () => {
  const distDir = await fixtureDist({
    'index.html': '<main><article data-public-card data-article-id="a1" data-deck="Grid capacity timing decides deployment risk before financing closes."><img src="/generated/fallbacks/ai-infrastructure.svg"></article><article data-public-card data-article-id="a2"><img src="/generated/fallbacks/ai-infrastructure.svg"><p class="article-deck">Grid capacity timing decides deployment risk before financing approval.</p></article><article data-public-card data-article-id="a3"><img src="/generated/fallbacks/ai-infrastructure.svg"><p class="signal-deck">Cooling crews decide which committed racks can turn live.</p></article></main>',
    'archive/index.html': '<main>Archive</main>',
    'news/a1/index.html': `<main><article><section class="detail-article-copy"><p>${cleanLongform}</p></section><img src="/generated/fallbacks/ai-infrastructure.svg"></article></main>`,
    'rss.xml': '<rss><channel><item><link>https://www.computecurrent.com/news/a1/</link></item></channel></rss>',
    'sitemap.xml': '<urlset><url><loc>https://www.computecurrent.com/news/a1/</loc></url></urlset>',
    'generated/fallbacks/ai-infrastructure.svg': '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
  });

  const result = await auditRenderedPublicOutput({ distDir, articleLimit: 50, minLongformCharacters: 4500 });

  assert.equal(result.ok, false);
  assert.ok(result.failures.some((failure) => failure.includes('duplicate deck prefix grid capacity timing decides deployment risk before financing')));
});

test('rendered public output audit reads article-deck without fallback deck attributes', async () => {
  const distDir = await fixtureDist({
    'index.html': '<main><article data-public-card data-article-id="a1"><img src="/generated/fallbacks/ai-infrastructure.svg"><p class="article-deck">Grid capacity timing decides deployment risk before financing closes.</p></article><article data-public-card data-article-id="a2"><img src="/generated/fallbacks/ai-infrastructure.svg"><p class="article-deck">Cooling delivery changes how operators stage rack commitments.</p></article></main>',
    'archive/index.html': '<main>Archive</main>',
    'news/a1/index.html': `<main><article><section class="detail-article-copy"><p>${cleanLongform}</p></section><img src="/generated/fallbacks/ai-infrastructure.svg"></article></main>`,
    'rss.xml': '<rss><channel><item><link>https://www.computecurrent.com/news/a1/</link></item></channel></rss>',
    'sitemap.xml': '<urlset><url><loc>https://www.computecurrent.com/news/a1/</loc></url></urlset>',
    'generated/fallbacks/ai-infrastructure.svg': '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
  });

  const result = await auditRenderedPublicOutput({ distDir, articleLimit: 50, minLongformCharacters: 4500 });

  assert.equal(result.ok, true);
  assert.equal(result.counts.cards, 2);
});
