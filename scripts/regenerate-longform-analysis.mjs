import { regeneratePublicFeed } from './lib/public-feed-regenerator.mjs';

const result = await regeneratePublicFeed({ longformTarget: Number(process.env.LONGFORM_TARGET || 15) });
console.log(`longform regenerated: ${result.counts.longform}`);
if (result.counts.longform < 10) process.exitCode = 1;
