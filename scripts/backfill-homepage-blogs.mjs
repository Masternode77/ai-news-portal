import path from 'node:path';
import { fileURLToPath } from 'node:url';
import latestNews from '../src/data/latest-news.json' with { type: 'json' };
import { homepageBlogSurfaceResult } from './lib/homepage-blog-surface-policy.mjs';
import { regenerateBlogSurfaceV4 } from './regenerate-blog-surface-v4.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const current = homepageBlogSurfaceResult(latestNews);
if (current.ok) {
  console.log(`homepage backfill not needed: ${current.localBlogCount} local blogs`);
} else {
  const result = await regenerateBlogSurfaceV4();
  console.log(`homepage backfill regenerated: ${result.after.localBlogCount} local blogs`);
  console.log(`report: ${path.relative(ROOT, result.reportPath)}`);
  if (!result.ok) process.exitCode = 1;
}
