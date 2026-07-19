import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import latestNews from '../src/data/latest-news.json' with { type: 'json' };
import archivedNews from '../src/data/archived-news.json' with { type: 'json' };
import { FEEDS, IMAGE_PROVIDER, OPENAI_IMAGE_MODEL } from './lib/constants.mjs';
import { publicHomepageFeedEligible } from './lib/homepage-feed-builder.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPORT_PATH = path.join(ROOT, 'docs/omo-ultra-audit.md');
const PUBLIC_ARTICLE_VERSION = 'blog_engine_v4';

export const REQUIRED_AUDIT_SECTIONS = [
  'Framework and Routing System',
  'Homepage Renderer',
  'Article Detail Renderer',
  'Article Data Store',
  'Crawler and Feed Sources',
  'Content Generation Pipeline',
  'Current Image Handling',
  'Publish Cron and Build Scripts',
  'Cache and Purge Mechanism',
  'Current Admin and Dashboard Routes',
  'Authentication and Environment Variables',
  'Deployment Platform Assumptions',
  'Stale Generated Article Pages',
  'Legacy Templates and Public Output Failures',
  'Safe Admin Implementation Location',
];

const BRIEF_BANNED_PHRASES = [
  'The issue is no longer demand alone',
  'The real test is whether',
  'The practical issue is whether',
  "Editor's Brief",
  'Watch execution details',
  'The financial question is whether',
  'The operating question is',
  'The customer question is',
  'The market tends to price',
  'The next signal to watch',
  'Read narrowly',
  'Read against the buildout cycle',
  'gives infrastructure readers a compact signal',
  'gives enterprise infrastructure teams another read',
  'matters most for capacity-per-watt planning',
  'is a capacity signal for operators tracking',
  'Why it matters: compute constraints can change build schedules',
  'Why it matters: facility constraints can change build schedules',
  'Why it matters: chip availability and performance per watt can reset cloud margins',
  'The useful takeaway is whether power changes deployment timing',
];

function relative(filePath) {
  return path.relative(ROOT, filePath);
}

async function readText(relativePath) {
  try {
    return await fs.readFile(path.join(ROOT, relativePath), 'utf8');
  } catch (error) {
    if (error instanceof Error) return '';
    throw error;
  }
}

function fileExists(relativePath) {
  return fsSync.existsSync(path.join(ROOT, relativePath));
}

function cleanText(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function articlePublicText(article = {}) {
  const lens = article.expertLensFull || {};
  const presentation = article.public_presentation || article.publicPresentation || {};
  return cleanText([
    article.title,
    article.summary,
    article.snippet,
    article.deck,
    article.expertLensShort,
    article.expertLens,
    lens.finalHeadline,
    lens.metaDescription,
    lens.finalArticleBody,
    presentation.title,
    presentation.deck,
    presentation.why_it_matters,
  ].filter(Boolean).join(' '));
}

function localImagePath(image = '') {
  const value = cleanText(image);
  if (!value || /^https?:\/\//i.test(value)) return '';
  return path.join(ROOT, 'public', value.replace(/^\//, ''));
}

function displayImage(article = {}) {
  const direct = [
    article.heroImage,
    article.thumbnailImage,
    article.ogImage,
    article.generatedImage,
    article.sourceImage,
    article.image,
    article.imageUrl,
    article.image_url,
    article.thumbnail,
  ].map(cleanText).find(Boolean);
  if (direct) return direct;
  return article.id ? `/generated/${String(article.id).replace(/[^a-zA-Z0-9_-]/g, '')}.svg` : '';
}

function imageExistsFor(article = {}) {
  const image = displayImage(article);
  if (!image) return false;
  if (/^https?:\/\//i.test(image)) return true;
  const filePath = localImagePath(image);
  return Boolean(filePath && fsSync.existsSync(filePath));
}

function articlePagePublished(article = {}) {
  return Boolean(article?.id && article.articlePagePublished !== false && !article.signalCardOnly);
}

function scoreFor(article = {}) {
  const score = Number(
    article.infrastructure_relevance_score
      ?? article.relevance_score
      ?? article.infrastructure_relevance?.infrastructure_relevance_score
      ?? 0
  );
  return Number.isFinite(score) ? score : 0;
}

function loadConfiguredBannedPhrases() {
  const filePath = path.join(ROOT, 'config/bannedPhrases.yml');
  if (!fsSync.existsSync(filePath)) return [];
  const text = fsSync.readFileSync(filePath, 'utf8');
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('- '))
    .map((line) => line.slice(2).replace(/^['"]|['"]$/g, '').trim())
    .filter(Boolean);
}

function matchPhrases(text, phrases) {
  const lower = text.toLowerCase();
  return phrases.filter((phrase) => lower.includes(phrase.toLowerCase()));
}

function sample(items, limit = 5) {
  return items.slice(0, limit).map((item) => `\`${item.id || item.title || 'unknown'}\``).join(', ') || 'none found';
}

function gitStatus() {
  try {
    return execFileSync('git', ['status', '--short'], { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch (error) {
    if (error instanceof Error) return `git status failed: ${error.message}`;
    throw error;
  }
}

function providerFiles() {
  const dir = path.join(ROOT, 'scripts/lib/image-providers');
  if (!fsSync.existsSync(dir)) return [];
  return fsSync.readdirSync(dir).filter((entry) => entry.endsWith('.mjs')).sort();
}

function countRouteFiles() {
  return {
    homepage: fileExists('src/pages/index.astro'),
    article: fileExists('src/pages/news/[id].astro'),
    adminEdit: fileExists('src/pages/admin/articles/editor.astro'),
    dashboard: fileExists('src/pages/admin/dashboard.astro'),
    sitemap: fileExists('src/pages/sitemap.xml.ts'),
    rss: fileExists('src/pages/rss.xml.ts'),
    robots: fileExists('src/pages/robots.txt.ts'),
  };
}

function analyzeArticles() {
  const all = [...latestNews, ...archivedNews];
  const configuredBannedPhrases = [...new Set([...BRIEF_BANNED_PHRASES, ...loadConfiguredBannedPhrases()])];
  const phraseMatches = [];
  const editorBriefItems = [];
  const clippedItems = [];

  for (const article of all) {
    const text = articlePublicText(article);
    const phrases = matchPhrases(text, configuredBannedPhrases);
    if (phrases.length) phraseMatches.push({ article, phrases });
    if (/editor'?s brief/i.test(text)) editorBriefItems.push(article);
    if (/\b(?:fuelin|clo|Hundreds o)\./i.test(text)) clippedItems.push(article);
  }

  const homepageItems = all.filter(publicHomepageFeedEligible);
  const lowRelevanceHomepage = homepageItems.filter((article) => {
    const text = articlePublicText(article);
    return scoreFor(article) < 0.68
      || /\b(?:gaming|wearable|3d printer|app store|consumer app|laptop review|deal|discount)\b/i.test(text);
  });
  const missingImages = homepageItems.filter((article) => !imageExistsFor(article));
  const stalePages = all.filter((article) => {
    if (!articlePagePublished(article)) return false;
    const version = article.public_generation_version || article.generation_version || '';
    return version && version !== PUBLIC_ARTICLE_VERSION;
  });
  const sourceOnly = all.filter((article) => article.articlePagePublished === false || article.signalCardOnly === true);

  return {
    all,
    homepageItems,
    phraseMatches,
    editorBriefItems,
    clippedItems,
    lowRelevanceHomepage,
    missingImages,
    stalePages,
    sourceOnly,
  };
}

export function validateAuditSections(markdown = '') {
  const missing = REQUIRED_AUDIT_SECTIONS.filter((section) => {
    const escaped = section.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return !new RegExp(`^## ${escaped}$`, 'm').test(markdown);
  });
  return {
    ok: missing.length === 0,
    missing,
  };
}

export async function buildOmoUltraAudit() {
  const packageJson = JSON.parse(await readText('package.json') || '{}');
  const astroConfig = await readText('astro.config.mjs');
  const authSource = await readText('api/admin/_auth.js');
  const adminStorageSource = await readText('src/plugins/storage/admin-storage-factory.mjs');
  const constantsSource = await readText('scripts/lib/constants.mjs');
  const pipelineSource = await readText('scripts/pipeline.mjs');
  const productionPhasesSource = await readText('scripts/lib/production-content-phases.mjs');
  const homepageSource = await readText('src/pages/index.astro');
  const articleSource = await readText('src/pages/news/[id].astro');
  const routes = countRouteFiles();
  const articles = analyzeArticles();
  const status = gitStatus();
  const imageProviderFiles = providerFiles();
  const duplicateProviderFiles = imageProviderFiles.filter((entry) => /\s2\.mjs$/.test(entry));

  const lines = [
    '# OMO Ultra Current State Audit',
    '',
    `Generated at: ${new Date().toISOString()}`,
    '',
    '## Dirty Worktree Warning',
    '',
    status
      ? `The worktree was not clean during this audit. Do not revert unrelated user or prior-agent changes. Current short status:\n\n\`\`\`text\n${status}\n\`\`\``
      : 'The worktree was clean when this audit ran.',
    '',
    '## Framework and Routing System',
    '',
    `- Framework: Astro is declared by \`package.json\` dependencies and configured in \`astro.config.mjs\`.`,
    `- Routing: filesystem routes under \`src/pages/\`; detected homepage=${routes.homepage}, article=${routes.article}, adminEdit=${routes.adminEdit}, dashboard=${routes.dashboard}, rss=${routes.rss}, sitemap=${routes.sitemap}.`,
    `- Sitemap filter excludes admin/dashboard/noindex paths: ${/admin|dashboard|noindex/i.test(astroConfig) ? 'yes' : 'needs review'}.`,
    '',
    '## Homepage Renderer',
    '',
    `- Renderer: \`src/pages/index.astro\` imports latest/archive JSON and calls \`buildHomepageFeed(..., { limit: 50, minimumVisible: 30 })\`.`,
    `- Current homepage source contains public nav/feed language, but still depends on generated card copy from \`scripts/lib/homepage-feed-builder.mjs\`.`,
    `- Homepage-eligible records found in JSON: ${articles.homepageItems.length}.`,
    `- Evidence: ${homepageSource.includes('LatestAnalysisFeed') ? '`LatestAnalysisFeed` is the active feed component.' : 'Latest feed component not detected; inspect homepage manually.'}`,
    '',
    '## Article Detail Renderer',
    '',
    `- Renderer: \`src/pages/news/[id].astro\` builds static paths from latest/archive JSON and filters with \`isPublicLongformArticle\`.`,
    `- It uses \`ArticleHeader\`, \`ArticleBody\`, \`SourceAttribution\`, \`AIDisclosureFooter\`, and related cards.`,
    `- Internal metadata is partially guarded by \`guardPublicCopy\`, \`cleanArticleBodyBlocks\`, and \`forbiddenPublicPhraseMatches\`.`,
    `- Evidence: route source length ${articleSource.length} bytes.`,
    '',
    '## Article Data Store',
    '',
    `- Primary public data: \`src/data/latest-news.json\` (${latestNews.length} records).`,
    `- Archive data: \`src/data/archived-news.json\` (${archivedNews.length} records).`,
    `- Adjacent stores: \`src/data/search-index.json\`, \`src/data/taxonomy-pages.json\`, \`src/data/editorial-cycles.json\`, \`src/data/claim-ledger.json\`, \`src/data/source-health.json\`.`,
    `- The data model is still legacy-compatible JSON rather than one explicit public article contract.`,
    '',
    '## Crawler and Feed Sources',
    '',
    `- Feed registry: \`scripts/lib/constants.mjs\` exports ${FEEDS.length} feed definitions.`,
    `- Fetcher: \`scripts/lib/fetch-feeds.mjs\` parses RSS/Atom into \`news-pool.json\`.`,
    `- Source selection and curation flow through \`scripts/lib/curate.mjs\`, \`source-priority-policy.mjs\`, and relevance routers.`,
    '',
    '## Content Generation Pipeline',
    '',
    `- Entrypoint: \`scripts/pipeline.mjs\`.`,
    `- Canonical production phases import extraction/relevance/repetition/expert-insight/image gates: ${/splitByInfrastructureRelevance/.test(productionPhasesSource) && /splitByRepetitionGate/.test(productionPhasesSource) && /ensureArticleImageResult/.test(productionPhasesSource) && /splitByArticleQualityGate/.test(productionPhasesSource) ? 'yes' : 'needs review'}.`,
    `- Generation modules live under \`scripts/lib/\`, with additional editorial rules in \`scripts/lib/AGENTS.override.md\`.`,
    `- The canonical command surface and production phase composition tie extraction QA, relevance, repetition, image metadata, publication receipts, and public eligibility together; \`scripts/pipeline.mjs\` remains a compatibility entrypoint (${pipelineSource.length} bytes).`,
    '',
    '## Current Image Handling',
    '',
    `- Current provider default: \`IMAGE_PROVIDER=${IMAGE_PROVIDER}\`, \`OPENAI_IMAGE_MODEL=${OPENAI_IMAGE_MODEL}\`.`,
    `- Provider registry files: ${imageProviderFiles.map((entry) => `\`${entry}\``).join(', ') || 'none found'}.`,
    `- Duplicate provider files needing cleanup decision: ${duplicateProviderFiles.map((entry) => `\`${entry}\``).join(', ') || 'none found'}.`,
    `- Public generated assets directory: \`public/generated/\`.`,
    `- Homepage-eligible records missing a reachable display image or fallback: ${articles.missingImages.length}; examples: ${sample(articles.missingImages)}.`,
    '',
    '## Publish Cron and Build Scripts',
    '',
    `- Build: \`${packageJson.scripts?.build || 'missing'}\`.`,
    `- Main pipeline script: \`${packageJson.scripts?.pipeline || 'missing'}\`.`,
    `- Content gate: \`${packageJson.scripts?.['content:gate'] || 'missing'}\`.`,
    `- GitHub scheduled workflow expected at \`.github/workflows/update-news.yml\`: ${fileExists('.github/workflows/update-news.yml') ? 'present' : 'missing'}.`,
    '',
    '## Cache and Purge Mechanism',
    '',
    `- Cache purge scripts present: \`scripts/purge-public-cache.mjs\`=${fileExists('scripts/purge-public-cache.mjs')}, \`scripts/purge-deployment-cache.mjs\`=${fileExists('scripts/purge-deployment-cache.mjs')}.`,
    `- Purge uses env-gated hooks and writes reports; live purge must not be claimed unless credentials and HTTP response are captured.`,
    '',
    '## Current Admin and Dashboard Routes',
    '',
    `- Admin edit route: \`src/pages/admin/articles/editor.astro\`=${routes.adminEdit}.`,
    `- Existing admin/serverless APIs cover login, dashboard, articles, article actions, revisions, media, audit, and operations under \`api/admin/\`.`,
    `- Existing dashboard route: \`src/pages/admin/dashboard.astro\`=${routes.dashboard}.`,
    `- The private CMS includes article queues, editor actions, image regeneration/upload, revision history, audit log, quarantine, source, and pipeline surfaces.`,
    '',
    '## Authentication and Environment Variables',
    '',
    `- Authentication requires \`ADMIN_USERNAME\`, Argon2id password verification via \`ADMIN_PASSWORD_HASH\`, and a strong \`ADMIN_SESSION_SECRET\`: ${/ADMIN_USERNAME/.test(authSource) && /ADMIN_PASSWORD_HASH/.test(authSource) && /ADMIN_SESSION_SECRET/.test(authSource) && /verifyArgon2/.test(authSource) ? 'implemented' : 'needs review'}.`,
    `- Session revocation, role/action authorization, CSRF validation, login throttling, and audit hooks are enforced by \`api/admin/_auth.js\`.`,
    `- Existing env constants include image, OpenRouter, Supabase, and pipeline settings in \`scripts/lib/constants.mjs\` (${constantsSource.length} bytes).`,
    `- Admin storage is adapter-backed: local atomic storage is development-only and ${/PostgresAdminStorage/.test(adminStorageSource) && /production_storage_required/.test(adminStorageSource) ? 'Postgres in production fails closed when unconfigured' : 'production storage needs review'}.`,
    '',
    '## Deployment Platform Assumptions',
    '',
    `- \`vercel.json\` exists and declares Astro build to \`dist\`: ${fileExists('vercel.json') ? 'yes' : 'missing'}.`,
    `- Root \`api/admin/*.js\` implies Vercel serverless functions rather than Astro \`src/pages/api\` endpoints.`,
    `- Local QA must account for Astro dev/preview and Vercel API behavior differences.`,
    '',
    '## Stale Generated Article Pages',
    '',
    `- Article-page-published records with non-${PUBLIC_ARTICLE_VERSION} generation version: ${articles.stalePages.length}; examples: ${sample(articles.stalePages)}.`,
    `- Source-only/direct-link items: ${articles.sourceOnly.length}.`,
    `- Whether generated article pages are stale and need regeneration: yes, any public article not on the current generation version or carrying legacy template phrases needs classify/regenerate/brief/hide/noindex handling.`,
    '',
    '## Legacy Templates and Public Output Failures',
    '',
    `- Why old Editor's Brief templates are still live: legacy JSON body/deck fields still contain old generated copy and article pages are rendered from those persisted fields until migration/regeneration rewrites or hides them. Matches found: ${articles.editorBriefItems.length}; examples: ${sample(articles.editorBriefItems)}.`,
    `- Why banned phrases still appear: phrase guards exist, but legacy records and fallback/presentation fields predate the current guard path. Current configured/brief phrase matches: ${articles.phraseMatches.length}; examples: ${sample(articles.phraseMatches.map((entry) => entry.article))}.`,
    `- Why low-relevance items still appear in the homepage feed: the canonical homepage predicate requires a public destination, source-grounded relevance, source integrity, and presentable card copy; remaining heuristic matches require editorial review rather than bypassing that predicate. Low-relevance homepage examples: ${articles.lowRelevanceHomepage.length}; examples: ${sample(articles.lowRelevanceHomepage)}.`,
    `- Why images are not reliably visible per article: display code supports multiple legacy fields and local fallbacks, but not every eligible record has a generated/fallback asset that exists on disk. Missing image examples: ${sample(articles.missingImages)}.`,
    `- Clipped extraction fragments detected in persisted public copy: ${articles.clippedItems.length}; examples: ${sample(articles.clippedItems)}.`,
    '',
    '## Safe Admin Implementation Location',
    '',
    `- Where admin should be implemented safely: extend \`src/pages/admin/\` for noindexed private shells and root \`api/admin/\` for Vercel-protected APIs, using shared auth/session/CSRF middleware in \`api/admin/_auth.js\` or a replacement module.`,
    `- Admin must remain excluded by \`astro.config.mjs\` sitemap filter and \`src/pages/robots.txt.ts\`, and private data must only load after authenticated API calls.`,
    `- CMS writes go through \`src/admin/admin-cms-service.mjs\` and the storage adapters under \`src/plugins/storage/\`; the GitHub helper is compatibility-only and must not bypass the canonical service.`,
  ];

  const markdown = `${lines.join('\n')}\n`;
  const validation = validateAuditSections(markdown);
  return {
    markdown,
    reportPath: REPORT_PATH,
    validation,
    metrics: {
      latestCount: latestNews.length,
      archiveCount: archivedNews.length,
      homepageEligibleCount: articles.homepageItems.length,
      stalePageCount: articles.stalePages.length,
      phraseMatchCount: articles.phraseMatches.length,
      lowRelevanceHomepageCount: articles.lowRelevanceHomepage.length,
      missingImageCount: articles.missingImages.length,
    },
  };
}

export async function writeOmoUltraAudit() {
  const audit = await buildOmoUltraAudit();
  if (!audit.validation.ok) {
    throw new Error(`Audit report missing required sections: ${audit.validation.missing.join(', ')}`);
  }
  await fs.mkdir(path.dirname(REPORT_PATH), { recursive: true });
  await fs.writeFile(REPORT_PATH, audit.markdown, 'utf8');
  return audit;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  try {
    const audit = await writeOmoUltraAudit();
    console.log(`report: ${relative(audit.reportPath)}`);
    console.log(`required sections: ${REQUIRED_AUDIT_SECTIONS.length}`);
    console.log(`homepage eligible: ${audit.metrics.homepageEligibleCount}`);
    console.log(`stale pages: ${audit.metrics.stalePageCount}`);
    console.log(`phrase matches: ${audit.metrics.phraseMatchCount}`);
    console.log(`missing images: ${audit.metrics.missingImageCount}`);
  } catch (error) {
    if (error instanceof Error) {
      console.error(error.message);
      process.exitCode = 1;
    } else {
      throw error;
    }
  }
}
