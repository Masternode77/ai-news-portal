import { publicFeedRegenerationExitCode, regeneratePublicFeed } from './lib/public-feed-regenerator.mjs';

const result = await regeneratePublicFeed({ longformTarget: Number(process.env.LONGFORM_TARGET || 15) });
console.log(result.mode === 'rights_review_safe_mode'
  ? 'longform regeneration paused: rights_review_safe_mode'
  : `longform approved after final integrity: ${result.counts.approvedLongform} (${result.counts.attemptedLongform} attempted)`);
process.exitCode = publicFeedRegenerationExitCode(result);
