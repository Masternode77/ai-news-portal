import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import latestNews from '../src/data/latest-news.json' with { type: 'json' };
import archivedNews from '../src/data/archived-news.json' with { type: 'json' };
import { evaluatePremiumArticleQuality } from './lib/premium-article-quality-gate.mjs';
import { evaluateMonetizationReadiness } from './lib/monetization-readiness-gate.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const reportPath = path.join(ROOT, 'docs/longform-public-audit-report.md');
const allArticles = [...latestNews, ...archivedNews];
const premiumArticles = allArticles.filter((article) => ['pro', 'team', 'enterprise'].includes(String(article.access_level || '').toLowerCase()));
const monetizedPublic = allArticles.filter((article) => article.homepagePublished !== false || article.articlePagePublished !== false);

const premiumFailures = premiumArticles
  .map((article) => ({ article, result: evaluatePremiumArticleQuality(article) }))
  .filter((item) => !item.result.ok);
const monetizationFailures = monetizedPublic
  .map((article) => ({ article, result: evaluateMonetizationReadiness(article) }))
  .filter((item) => !item.result.ok);

const lines = [
  '# Longform Public Audit Report',
  '',
  `Generated at: ${new Date().toISOString()}`,
  `Premium articles checked: ${premiumArticles.length}`,
  `Premium quality failures: ${premiumFailures.length}`,
  `Monetization readiness failures: ${monetizationFailures.length}`,
  '',
  '## Premium Failures',
  '',
  ...(
    premiumFailures.length
      ? premiumFailures.map(({ article, result }) => `- ${article.id}: ${article.title} (${result.reasons.join(', ')})`)
      : ['None']
  ),
  '',
  '## Monetization Readiness Failures',
  '',
  ...(
    monetizationFailures.length
      ? monetizationFailures.slice(0, 30).map(({ article, result }) => `- ${article.id}: ${article.title} (${result.reasons.join(', ')})`)
      : ['None']
  ),
  '',
];

fs.writeFileSync(reportPath, `${lines.join('\n')}\n`);

if (premiumFailures.length || monetizationFailures.length) {
  console.error(`longform public audit failed: premium=${premiumFailures.length} monetization=${monetizationFailures.length}`);
  process.exit(1);
}

console.log('longform public audit passed');
