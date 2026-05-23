import { regeneratePublicFeed } from './lib/public-feed-regenerator.mjs';

const result = await regeneratePublicFeed({ briefTarget: Number(process.env.BRIEF_TARGET || 35) });
console.log(`brief cards regenerated: ${result.counts.brief + result.counts.signal}`);
if (result.counts.brief + result.counts.signal < 20) process.exitCode = 1;
