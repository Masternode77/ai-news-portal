import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { publicFeedRegenerationExitCode, regeneratePublicFeed } from './lib/public-feed-regenerator.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPORT_PATH = path.join(ROOT, 'docs/public-feed-regeneration-report.md');

const result = await regeneratePublicFeed();
const lines = [
  '# Public Feed Regeneration Report',
  '',
  `Generated at: ${new Date().toISOString()}`,
  '',
  `- candidate items reviewed: ${result.counts.candidates}`,
  `- attempted longform analyses: ${result.counts.attemptedLongform}`,
  `- approved longform analysis pages: ${result.counts.approvedLongform}`,
  `- attempted editorial briefs: ${result.counts.attemptedBrief}`,
  `- approved editorial briefs: ${result.counts.approvedBrief}`,
  `- attempted signal cards: ${result.counts.attemptedSignal}`,
  `- approved signal cards: ${result.counts.approvedSignal}`,
  `- final-integrity quarantines: ${result.counts.publicationIntegrityBlocked}`,
  `- hidden items: ${result.counts.hidden}`,
  `- noindexed or source-only items: ${result.counts.noindexed}`,
  `- homepage-visible public items: ${result.counts.homepagePublic}`,
  `- archive-visible public items: ${result.counts.archivePublic}`,
  '',
  result.mode === 'rights_review_safe_mode'
    ? 'Rights-review safe mode is active: zero authorized sources and zero approved public items. Publication remains paused.'
    : result.ready
      ? 'The post-integrity approved public feed has enough visible items for an active publication surface.'
      : 'The post-integrity approved public feed remains below one or more publication-volume targets.',
];

await fs.writeFile(REPORT_PATH, `${lines.join('\n')}\n`, 'utf8');
console.log(`public feed regenerated (${result.mode}, ready=${result.ready}): ${JSON.stringify(result.counts)}`);
process.exitCode = publicFeedRegenerationExitCode(result);
