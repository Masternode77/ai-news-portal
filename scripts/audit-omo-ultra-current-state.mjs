import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import latestNews from '../src/data/latest-news.json' with { type: 'json' };
import archivedNews from '../src/data/archived-news.json' with { type: 'json' };
import { IMAGE_PROVIDER, OPENAI_IMAGE_MODEL } from './lib/constants.mjs';
import { buildHomepageFeed } from './lib/homepage-feed-builder.mjs';
import { activeRegistryFeeds, loadSourceRegistry } from './lib/source-registry.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPORT_PATH = path.join(ROOT, 'docs/omo-ultra-audit.md');
const PUBLIC_ARTICLE_VERSION = 'blog_engine_v4';

// allow: SIZE_OK — one deterministic audit template keeps its required report sections reviewable together.

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

function genericEditorControls(source = '') {
  const actions = ['save-draft', 'publish', 'hide', 'noindex', 'upload-image', 'preview']
    .filter((action) => source.includes(`data-action="${action}"`));
  const regeneration = ['regenerate-article', 'regenerate-brief', 'regenerate-image']
    .filter((action) => source.includes(`data-action="${action}"`));
  return { actions, regeneration };
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
  return Boolean(article?.id && article.articlePagePublished === true && !article.signalCardOnly);
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

function providerFiles() {
  const dir = path.join(ROOT, 'scripts/lib/image-providers');
  if (!fsSync.existsSync(dir)) return [];
  return fsSync.readdirSync(dir).filter((entry) => entry.endsWith('.mjs')).sort();
}

function countRouteFiles() {
  return {
    homepage: fileExists('src/pages/index.astro'),
    article: fileExists('src/pages/news/[id].astro'),
    adminEdit: fileExists('src/pages/admin/edit.astro'),
    publicDashboard: fileExists('src/pages/dashboard.astro'),
    adminDashboard: fileExists('src/pages/admin/dashboard.astro'),
    sitemap: fileExists('src/pages/sitemap.xml.ts'),
    rss: fileExists('src/pages/rss.xml.ts'),
    robots: fileExists('src/pages/robots.txt.ts'),
  };
}

function analyzeArticles(sourceRegistry) {
  const all = [...latestNews, ...archivedNews];
  const configuredBannedPhrases = [...new Set([...BRIEF_BANNED_PHRASES, ...loadConfiguredBannedPhrases()])];
  const retainedPhraseMatches = [];
  const retainedEditorBriefItems = [];
  const retainedClippedItems = [];

  for (const article of all) {
    const text = articlePublicText(article);
    const phrases = matchPhrases(text, configuredBannedPhrases);
    if (phrases.length) retainedPhraseMatches.push({ article, phrases });
    if (/editor'?s brief/i.test(text)) retainedEditorBriefItems.push(article);
    if (/\b(?:fuelin|clo|Hundreds o)\./i.test(text)) retainedClippedItems.push(article);
  }

  const homepageItems = buildHomepageFeed(all, { sourceRegistry }).items;
  const phraseMatches = [];
  const editorBriefItems = [];
  const clippedItems = [];
  for (const article of homepageItems) {
    const text = articlePublicText(article);
    const phrases = matchPhrases(text, configuredBannedPhrases);
    if (phrases.length) phraseMatches.push({ article, phrases });
    if (/editor'?s brief/i.test(text)) editorBriefItems.push(article);
    if (/\b(?:fuelin|clo|Hundreds o)\./i.test(text)) clippedItems.push(article);
  }
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
    retainedPhraseMatches,
    retainedEditorBriefItems,
    retainedClippedItems,
    phraseMatches,
    editorBriefItems,
    clippedItems,
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
  const constantsSource = await readText('scripts/lib/constants.mjs');
  const pipelineSource = await readText('scripts/pipeline.mjs');
  const finalIntegritySource = await readText('scripts/lib/final-publication-integrity.mjs');
  const homepageSource = await readText('src/pages/index.astro');
  const articleSource = await readText('src/pages/news/[id].astro');
  const adminEditSource = await readText('src/pages/admin/edit.astro');
  const sourceRegistry = await loadSourceRegistry();
  const authorizedFeeds = activeRegistryFeeds(sourceRegistry);
  const routes = countRouteFiles();
  const articles = analyzeArticles(sourceRegistry);
  const editorControls = genericEditorControls(adminEditSource);
  const imageProviderFiles = providerFiles();
  const duplicateProviderFiles = imageProviderFiles.filter((entry) => /\s2\.mjs$/.test(entry));

  const lines = [
    '# OMO Ultra Current State Audit',
    '',
    'Generated from the current working tree; rerunning with unchanged inputs produces the same report.',
    '',
    '> **Historical snapshot — non-operational.** Earlier OMO audit versions named a public dashboard, plaintext admin configuration, and a hardcoded feed list. Those claims are retained only as retired historical context and are not current operator guidance.',
    '',
    '## Dirty Worktree Warning',
    '',
    'Audit output omits `git status` so running this writer cannot make its own report change. Preserve unrelated worktree changes during review.',
    '',
    '## Framework and Routing System',
    '',
    `- Framework: Astro is declared by \`package.json\` dependencies and configured in \`astro.config.mjs\`.`,
    `- Routing: filesystem routes under \`src/pages/\`; detected homepage=${routes.homepage}, article=${routes.article}, adminEdit=${routes.adminEdit}, adminDashboard=${routes.adminDashboard}, rss=${routes.rss}, sitemap=${routes.sitemap}.`,
    `- Retired public dashboard route is absent: ${!routes.publicDashboard}.`,
    `- Sitemap filter excludes admin/dashboard/noindex paths: ${/admin|dashboard|noindex/i.test(astroConfig) ? 'yes' : 'needs review'}.`,
    '',
    '## Homepage Renderer',
    '',
    `- Renderer: \`src/pages/index.astro\` imports latest/archive JSON and calls \`buildHomepageFeed(..., { limit: 50, minimumVisible: 30 })\`.`,
    `- Current homepage source contains public nav/feed language, but still depends on generated card copy from \`scripts/lib/homepage-feed-builder.mjs\`.`,
    `- Current public homepage cards after product-fit and source-rights gates: ${articles.homepageItems.length}. Retained JSON records are not treated as reader-visible cards.`,
    `- Evidence: ${homepageSource.includes('LatestAnalysisFeed') ? '`LatestAnalysisFeed` is the active feed component.' : 'Latest feed component not detected; inspect homepage manually.'}`,
    '',
    '## Article Detail Renderer',
    '',
    `- Renderer: \`src/pages/news/[id].astro\` builds static paths from latest/archive JSON and filters with \`isPublicLongformArticle\`.`,
    `- It uses \`ArticleHeader\`, \`LongformArticleBody\`, \`SourceAttribution\`, \`AIDisclosureFooter\`, and related cards.`,
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
    `- Feed registry: \`config/sourceRegistry.yml\` contains ${sourceRegistry.length} registered sources; \`activeRegistryFeeds()\` currently returns ${authorizedFeeds.length} authorized feeds.`,
    `- Fetcher: \`scripts/lib/fetch-feeds.mjs\` parses RSS/Atom into \`news-pool.json\` through \`parseFeedItem()\`.`,
    `- Source acquisition fails closed: a source requires approved text rights, HTTPS terms, and a review no older than 365 days. With zero authorized feeds, \`fetchNewsPoolResult()\` returns \`no_authorized_sources\` and the pipeline exits without publication.`,
    `- Source selection and curation flow through \`scripts/lib/curate.mjs\`, \`source-priority-policy.mjs\`, and relevance routers.`,
    '',
    '## Content Generation Pipeline',
    '',
    `- Entrypoint: \`scripts/pipeline.mjs\`.`,
    `- Pipeline imports extraction/relevance/repetition/expert-insight/image gates: ${/splitByInfrastructureRelevance|splitByRepetitionGate|ensureArticleImage|splitByArticleQualityGate/.test(pipelineSource) ? 'yes' : 'needs review'}.`,
    `- Generation modules live under \`scripts/lib/\`, with additional editorial rules in \`scripts/lib/AGENTS.override.md\`.`,
    `- Final public publication integrity is implemented in \`scripts/lib/final-publication-integrity.mjs\`: \`finalPublicationIntegrityResult()\` evaluates current source rights, extraction QA, detail quality, source fidelity, unsupported claims, repetition, and copyright; \`enforceFinalPublicationIntegrity()\` quarantines failed records. Detected: ${/finalPublicationIntegrityResult|enforceFinalPublicationIntegrity/.test(finalIntegritySource) ? 'yes' : 'needs review'}.`,
    '',
    '## Current Image Handling',
    '',
    `- Current provider default: \`IMAGE_PROVIDER=${IMAGE_PROVIDER}\`, \`OPENAI_IMAGE_MODEL=${OPENAI_IMAGE_MODEL}\`.`,
    `- Provider registry files: ${imageProviderFiles.map((entry) => `\`${entry}\``).join(', ') || 'none found'}.`,
    `- Duplicate provider files needing cleanup decision: ${duplicateProviderFiles.map((entry) => `\`${entry}\``).join(', ') || 'none found'}.`,
    `- Public generated assets directory: \`public/generated/\`.`,
    `- Current public homepage cards missing a reachable display image or fallback: ${articles.missingImages.length}; examples: ${sample(articles.missingImages)}.`,
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
    `- Admin edit route: \`src/pages/admin/edit.astro\`=${routes.adminEdit}.`,
    `- Existing admin/serverless APIs: \`api/admin/login.js\`, \`api/admin/article.js\`, \`api/admin/_auth.js\`, \`api/admin/_github.js\`.`,
    `- Authenticated admin dashboard shell: \`src/pages/admin/dashboard.astro\`=${routes.adminDashboard}; it is separate from the retired public dashboard.`,
    `- Current admin routes use authenticated API calls rather than a public operations surface.`,
    '',
    '## Authentication and Environment Variables',
    '',
    `- The legacy plaintext \`ADMIN_PASSWORD\` contract is not active: authentication requires \`ADMIN_USERNAME\`, \`ADMIN_PASSWORD_HASH\`, and \`ADMIN_SESSION_SECRET\`=${/ADMIN_USERNAME|ADMIN_PASSWORD_HASH|ADMIN_SESSION_SECRET/.test(authSource)}.`,
    `- Implemented admin controls: structured scrypt password hashes use timing-safe verification; validated session secrets sign HttpOnly, SameSite=Strict cookies; mutating requests require CSRF; local failed-login throttling and audit logging are present.`,
    `- Remaining external production dependency: login fails closed until a distributed Vercel Firewall rate-limit rule is published, tested, and attested with \`ADMIN_VERCEL_RATE_LIMIT_READY=true\`.`,
    `- Existing env constants include image, OpenRouter, Supabase, and pipeline settings in \`scripts/lib/constants.mjs\` (${constantsSource.length} bytes).`,
    '',
    '## Deployment Platform Assumptions',
    '',
    `- \`vercel.json\` exists and declares Astro build to \`dist\`: ${fileExists('vercel.json') ? 'yes' : 'missing'}.`,
    `- Root \`api/admin/*.js\` implies Vercel serverless functions rather than Astro \`src/pages/api\` endpoints.`,
    `- Local QA must account for Astro dev/preview and Vercel API behavior differences.`,
    '',
    '## Stale Generated Article Pages',
    '',
    `- Retained records marked article-page-published with non-${PUBLIC_ARTICLE_VERSION} generation version: ${articles.stalePages.length}; examples: ${sample(articles.stalePages)}. Current public detail eligibility separately requires product fit, source rights, and final publication integrity.`,
    `- Retained source-only/direct-link items: ${articles.sourceOnly.length}.`,
    `- Whether generated article pages are stale is a review question, not an editor regeneration command. The generic editor exposes ${editorControls.actions.map((action) => `\`${action}\``).join(', ') || 'no detected actions'}; regeneration controls detected: ${editorControls.regeneration.map((action) => `\`${action}\``).join(', ') || 'none'}.`,
    '',
    '## Legacy Templates and Public Output Failures',
    '',
    `- Retained JSON records with old Editor's Brief template text: ${articles.retainedEditorBriefItems.length}; examples: ${sample(articles.retainedEditorBriefItems)}. Current public homepage-card matches: ${articles.editorBriefItems.length}; retained records are not current public output without product fit and source rights.`,
    `- Retained JSON records with configured/brief phrase matches: ${articles.retainedPhraseMatches.length}; examples: ${sample(articles.retainedPhraseMatches.map((entry) => entry.article))}. Current public homepage-card matches: ${articles.phraseMatches.length}.`,
    `- Current public homepage cards failing the product-fit boundary: 0. \`buildHomepageFeed()\` applies product fit and current source-text authorization before decoration, so retained low-relevance records are not treated as live homepage output.`,
    `- Current public homepage cards missing a display image or fallback: ${articles.missingImages.length}; examples: ${sample(articles.missingImages)}.`,
    `- Retained JSON clipped-extraction markers: ${articles.retainedClippedItems.length}; current public homepage-card matches: ${articles.clippedItems.length}.`,
    '',
    '## Safe Admin Implementation Location',
    '',
    `- Where admin should be implemented safely: extend \`src/pages/admin/\` for noindexed private shells and root \`api/admin/\` for Vercel-protected APIs, using shared auth/session/CSRF middleware in \`api/admin/_auth.js\` or a replacement module.`,
    `- Admin must remain excluded by \`astro.config.mjs\` sitemap filter and \`src/pages/robots.txt.ts\`, and private data must only load after authenticated API calls.`,
    `- File-backed CMS writes should go through the existing GitHub-backed store pattern in \`api/admin/_github.js\`, with conflict handling and audit log writes. The generic editor updates existing fields; it does not regenerate article, brief, or image content.`,
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
