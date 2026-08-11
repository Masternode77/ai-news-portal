import { publicFeedRegenerationExitCode, regeneratePublicFeed } from './lib/public-feed-regenerator.mjs';

const result = await regeneratePublicFeed({ briefTarget: Number(process.env.BRIEF_TARGET || 35) });
console.log(result.mode === 'rights_review_safe_mode'
  ? 'brief regeneration paused: rights_review_safe_mode'
  : `brief cards approved after final integrity: ${result.counts.approvedBrief + result.counts.approvedSignal} (${result.counts.attemptedBrief + result.counts.attemptedSignal} attempted)`);
process.exitCode = publicFeedRegenerationExitCode(result);
