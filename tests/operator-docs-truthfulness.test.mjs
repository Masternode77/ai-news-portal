import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';
import { buildOmoUltraAudit } from '../scripts/audit-omo-ultra-current-state.mjs';
import { IMAGE_PROVIDER } from '../scripts/lib/constants.mjs';

const readRepositoryText = (relativePath) => fs.readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');

test('Given the current source registry When reading the pipeline map Then it documents the rights-gated feed contract', async () => {
  const pipelineMap = await readRepositoryText('docs/content-pipeline-map.md');

  assert.match(pipelineMap, /config\/sourceRegistry\.yml/);
  assert.match(pipelineMap, /activeRegistryFeeds/);
  assert.match(pipelineMap, /parseFeedItem/);
  assert.match(pipelineMap, /allow_text_use/);
  assert.match(pipelineMap, /allow_image_reuse/);
  assert.match(pipelineMap, /365/);
  assert.match(pipelineMap, /no_authorized_sources/);
  assert.doesNotMatch(pipelineMap, /Primary source list: `scripts\/lib\/constants\.mjs` `FEEDS`/);
  assert.doesNotMatch(pipelineMap, /parseItem\(\)/);
});

test('Given the current repository When building the OMO audit Then it keeps obsolete claims historical and emits only current contracts', async () => {
  const audit = await buildOmoUltraAudit();

  assert.match(audit.markdown, /Historical snapshot — non-operational/);
  assert.match(audit.markdown, /config\/sourceRegistry\.yml/);
  assert.match(audit.markdown, /public dashboard.*absent/i);
  assert.match(audit.markdown, /ADMIN_PASSWORD.*not.*active/i);
  assert.doesNotMatch(audit.markdown, /constants\.mjs` exports .*feed definitions/);
  assert.doesNotMatch(audit.markdown, /Existing dashboard route: `src\/pages\/dashboard\.astro`/);
  assert.doesNotMatch(audit.markdown, /plaintext-style envs/);
});

test('Given the fail-closed workflow When reading the README Then it describes conditional publication and the actual gate sequence', async () => {
  const readme = await readRepositoryText('README.md');

  assert.match(readme, /no authorized\s+sources/i);
  assert.match(readme, /without publication/i);
  assert.match(readme, /npm test/);
  assert.match(readme, /npm run content:gate/);
  assert.doesNotMatch(readme, /Publishes exactly \*\*2 stories/i);
  assert.doesNotMatch(readme, /Latest-3 Korean Expert Lens/i);
  assert.doesNotMatch(readme, /capture homepage screenshot/i);
  assert.doesNotMatch(readme, /send the screenshot to Telegram/i);
});

test('Given the image2 runtime contract When reading operator image guidance Then it names the current provider-specific fallback paths', async () => {
  const [implementationNotes, readme, imageReport] = await Promise.all([
    readRepositoryText('IMPLEMENTATION_NOTES.md'),
    readRepositoryText('README.md'),
    readRepositoryText('docs/image-generation-report.md'),
  ]);

  assert.equal(IMAGE_PROVIDER, 'image2');
  assert.doesNotMatch(implementationNotes, /premium glass \/ monochrome dashboard/i);
  assert.doesNotMatch(implementationNotes, /Defaults to `IMAGE_PROVIDER=chatgpt`/);
  assert.match(readme, /IMAGE_PROVIDER=image2/);
  assert.match(readme, /OPENAI_API_KEY/);
  assert.match(readme, /PIPELINE_OFFLINE/);
  assert.match(readme, /source-authorized poster/i);
  assert.match(readme, /category fallback/i);
  assert.match(imageReport, /Historical snapshot — non-operational/);
});
