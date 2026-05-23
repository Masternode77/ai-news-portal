import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { regeneratePublicFeed } from './lib/public-feed-regenerator.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPORT_PATH = path.join(ROOT, 'docs/public-feed-regeneration-report.md');

const result = await regeneratePublicFeed();
const lines = [
  '# Public Feed Regeneration Report',
  '',
  `Generated at: ${new Date().toISOString()}`,
  '',
  `- candidate items reviewed: ${result.counts.candidates}`,
  `- longform analysis pages: ${result.counts.longform}`,
  `- editorial briefs: ${result.counts.brief}`,
  `- signal cards: ${result.counts.signal}`,
  `- hidden items: ${result.counts.hidden}`,
  `- noindexed or source-only items: ${result.counts.noindexed}`,
  `- homepage-visible public items: ${result.counts.homepagePublic}`,
  `- archive-visible public items: ${result.counts.archivePublic}`,
  '',
  result.ok
    ? 'The public feed now has enough visible items for an active publication surface.'
    : 'The public feed remains below one or more publication-volume targets.',
];

await fs.writeFile(REPORT_PATH, `${lines.join('\n')}\n`, 'utf8');
console.log(`public feed regenerated: ${JSON.stringify(result.counts)}`);
if (!result.ok) process.exitCode = 1;
