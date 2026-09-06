import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const reference = JSON.parse(fs.readFileSync('src/data/infrastructure-reference.json', 'utf8'));
const hubSlugs = new Set(reference.hubs.map((entry) => entry.slug));
const entitySlugs = new Set(reference.entities.map((entry) => entry.slug));
const glossarySlugs = new Set(reference.glossary.map((entry) => entry.slug));
const read = (path) => fs.readFileSync(path, 'utf8');

test('reference inventory has the intended bounded coverage and a dated review point', () => {
  assert.equal(reference.asOf, '2026-09-06');
  assert.deepEqual([...hubSlugs], ['northern-virginia', 'texas', 'phoenix']);
  assert.deepEqual([...entitySlugs], ['dominion-energy', 'ercot', 'aps', 'equinix', 'digital-realty']);
  assert.ok(reference.glossary.length >= 12);
  assert.equal(glossarySlugs.size, reference.glossary.length);
});

test('regional guides are substantive, source-linked and explicit about decision signals', () => {
  for (const hub of reference.hubs) {
    const wordCount = hub.summary.trim().split(/\s+/).length;
    assert.ok(wordCount >= 80 && wordCount <= 120, `${hub.slug} summary has ${wordCount} words`);
    assert.ok(hub.bottleneck.length >= 40);
    assert.ok(hub.watch.length >= 3);
    assert.ok(hub.relatedTerms.length >= 1);
    assert.ok(hub.sources.length >= 1);
    for (const source of hub.sources) assert.doesNotThrow(() => new URL(source.url));
    for (const slug of hub.entitySlugs) assert.ok(entitySlugs.has(slug), `${hub.slug} -> ${slug}`);
    for (const slug of hub.glossarySlugs) assert.ok(glossarySlugs.has(slug), `${hub.slug} -> ${slug}`);
  }
});

test('entity, hub and glossary relationships resolve in both page families', () => {
  for (const entity of reference.entities) {
    assert.ok(entity.summary.length >= 120);
    assert.ok(entity.watch.length >= 3);
    assert.ok(entity.sources.length >= 1);
    for (const source of entity.sources) assert.doesNotThrow(() => new URL(source.url));
    for (const slug of entity.hubSlugs) assert.ok(hubSlugs.has(slug), `${entity.slug} -> ${slug}`);
    for (const slug of entity.glossarySlugs) assert.ok(glossarySlugs.has(slug), `${entity.slug} -> ${slug}`);
  }
  for (const term of reference.glossary) {
    assert.ok(term.definition.length >= 90, term.slug);
    assert.doesNotThrow(() => new URL(term.source));
  }
});

test('dynamic pages use the public feed eligibility pipeline before relevance matching', () => {
  for (const path of ['src/pages/hubs/[slug].astro', 'src/pages/entities/[slug].astro']) {
    const source = read(path);
    assert.match(source, /buildHomepageFeed\(\[\.\.\.latestNews, \.\.\.archivedNews\]/);
    assert.match(source, /minimumVisible: 0/);
    assert.match(source, /No current article passes both the public-feed checks/);
    assert.doesNotMatch(source, /latestNews\.filter|archivedNews\.filter/);
  }
});

test('all reference routes and accessible glossary states are implemented', () => {
  for (const path of [
    'src/pages/hubs/index.astro',
    'src/pages/hubs/[slug].astro',
    'src/pages/entities/index.astro',
    'src/pages/entities/[slug].astro',
    'src/pages/glossary.astro',
  ]) assert.ok(fs.existsSync(path), path);

  const glossaryPage = read('src/pages/glossary.astro');
  assert.match(glossaryPage, /role="search"/);
  assert.match(glossaryPage, /aria-live="polite"/);
  assert.match(glossaryPage, /data-glossary-empty hidden/);
  assert.match(glossaryPage, /entry\.hidden = !matches/);
});

test('reader-facing copy preserves queue, forecast and capacity boundaries', () => {
  const corpus = JSON.stringify(reference).toLowerCase();
  assert.match(corpus, /queue entry is a request/);
  assert.match(corpus, /not measurements of current consumption/);
  assert.match(corpus, /does not provide investment advice/);
  assert.match(corpus, /ercot operates the grid/);
  assert.doesNotMatch(corpus, /guaranteed capacity|guaranteed return|investment recommendation/);
});
