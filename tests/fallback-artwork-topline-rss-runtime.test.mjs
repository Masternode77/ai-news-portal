import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { ensurePublicFallbackImages } from '../scripts/prepare-static-images.mjs';

const read = (relativePath) => fs.readFileSync(relativePath, 'utf8');
const fallbackDirectory = 'public/generated/fallbacks';
const forbiddenArtworkCopy = /Fallback editorial image/i;

test('finished fallback artwork never exposes placeholder copy in the generator, committed assets, or rendered homepage asset', async () => {
  const generator = read('scripts/lib/static-image-prep-helpers.mjs');
  const committedFallbacks = fs.readdirSync(fallbackDirectory)
    .filter((fileName) => fileName.endsWith('.svg'))
    .sort();
  const builtHome = read('dist/index.html');
  const temporaryPublicDirectory = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'compute-current-fallback-artwork-'));

  try {
    await ensurePublicFallbackImages({ publicDir: temporaryPublicDirectory });
    assert.doesNotMatch(generator, forbiddenArtworkCopy);
    assert.match(generator, /Compute Current editorial briefing/);
    assert.match(builtHome, /\/generated\/fallbacks\/ai-infrastructure\.svg/);

    for (const fileName of committedFallbacks) {
      const source = read(path.join(fallbackDirectory, fileName));
      const built = read(path.join('dist/generated/fallbacks', fileName));
      const generated = await fsPromises.readFile(path.join(temporaryPublicDirectory, 'generated/fallbacks', fileName), 'utf8');

      assert.doesNotMatch(source, forbiddenArtworkCopy, fileName);
      assert.doesNotMatch(built, forbiddenArtworkCopy, `built ${fileName}`);
      assert.doesNotMatch(generated, forbiddenArtworkCopy, `generated ${fileName}`);
      assert.match(source, /Compute Current editorial briefing/, fileName);
      assert.match(generated, /Compute Current editorial briefing/, `generated ${fileName}`);
    }
  } finally {
    await fsPromises.rm(temporaryPublicDirectory, { recursive: true, force: true });
  }
});

test('homepage topline RSS remains compact while retaining a 40px target with hover and focus-visible feedback', () => {
  const css = read('src/styles/terminal.css');

  assert.match(css, /\.topline-rss\s*\{[\s\S]*display:\s*inline-flex;[\s\S]*align-items:\s*center;[\s\S]*min-height:\s*40px;[\s\S]*padding:\s*0 12px;/);
  assert.match(css, /\.topline-rss:hover\s*\{[\s\S]*background:\s*var\(--al-soft\);/);
  assert.match(css, /\.topline-rss:focus-visible\s*\{[\s\S]*outline:\s*3px solid var\(--al-blue\);[\s\S]*outline-offset:\s*3px;/);
});
