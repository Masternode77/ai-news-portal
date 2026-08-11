import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';
import archivedNews from '../src/data/archived-news.json' with { type: 'json' };
import latestNews from '../src/data/latest-news.json' with { type: 'json' };
import { buildOmoUltraAudit } from '../scripts/audit-omo-ultra-current-state.mjs';
import { buildHomepageFeed } from '../scripts/lib/homepage-feed-builder.mjs';
import { OPENAI_IMAGE_MODEL } from '../scripts/lib/constants.mjs';

const read = (relativePath) => fs.readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');

test('Given the current public eligibility boundary When generating the OMO audit Then its homepage count and legacy diagnostics describe rendered public output instead of retained raw records', async () => {
  const expectedFeed = buildHomepageFeed([...latestNews, ...archivedNews]);
  const audit = await buildOmoUltraAudit();

  assert.equal(audit.metrics.homepageEligibleCount, expectedFeed.items.length);
  assert.match(audit.markdown, /Current public homepage cards after product-fit and source-rights gates/i);
  assert.doesNotMatch(audit.markdown, /Why old Editor's Brief templates are still live/i);
  assert.doesNotMatch(audit.markdown, /Why low-relevance items still appear in the homepage feed/i);
});

test('Given the source-authorized public pipeline When reading the pipeline map Then it names the universal product-fit gate and current crawler identity without a manual bypass', async () => {
  const map = await read('docs/content-pipeline-map.md');

  assert.match(map, /ComputeCurrentBot\/1\.0/);
  assert.match(map, /sourceRegistryId/);
  assert.match(map, /current source-text authorization/i);
  assert.match(map, /public product-fit gate/i);
  assert.doesNotMatch(map, /AINewsPortalBot\/1\.0/);
  assert.doesNotMatch(map, /unless manually approved|manual approval flag overrides homepage suppression/i);
});

test('Given the executable image fallback default When reading the README Then it names the same model', async () => {
  const readme = await read('README.md');

  assert.equal(OPENAI_IMAGE_MODEL, 'gpt-image-2');
  assert.match(readme, new RegExp(`OPENAI_IMAGE_MODEL.*${OPENAI_IMAGE_MODEL}`));
  assert.doesNotMatch(readme, /OPENAI_IMAGE_MODEL.*gpt-image-1/i);
});

test('Given public RSS and social-share assets When reading their source contracts Then neither promises a fixed cadence', async () => {
  const [feed, generator, png] = await Promise.all([
    read('public/feed.xsl'),
    read('scripts/generate-og-default.mjs'),
    fs.readFile(new URL('../public/og-default.png', import.meta.url)),
  ]);

  assert.match(feed, /currently eligible public items/i);
  assert.match(generator, /source-linked analysis/i);
  assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.doesNotMatch(`${feed}\n${generator}`, /every new analysis|updates several times a day|Updated several times a day/i);
});
