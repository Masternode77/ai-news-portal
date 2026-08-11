import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import typescript from 'typescript';

const projectRoot = process.cwd();
const monetizationSourcePath = path.join(projectRoot, 'src/lib/monetization.ts');
const layoutPath = path.join(projectRoot, 'src/layouts/Layout.astro');
const consentBannerPath = path.join(projectRoot, 'src/components/monetize/ConsentBanner.astro');

function verifiedPublicDetailFixture() {
  return {
    public_status: 'published',
    articlePagePublished: true,
    quarantined: false,
    seo_noindex: false,
    archiveOnly: false,
    publication_integrity: { ok: true },
  };
}

async function loadPolicy(environment, inventory = [], currentDetails = inventory) {
  const source = await fs.readFile(monetizationSourcePath, 'utf8');
  const executableSource = source.replace(
    "import latestNews from '../data/latest-news.json';",
    `const latestNews = ${JSON.stringify(inventory)};`,
  ).replace(
    "import archivedNews from '../data/archived-news.json';",
    'const archivedNews = [];',
  ).replace(
    "import { currentPublicDetailInventory } from './monetization-inventory.mjs';",
    `const currentPublicDetailInventory = () => ${JSON.stringify(currentDetails)};`,
  ).replace(
    'const env = import.meta.env as Record<string, unknown>;',
    `const env = ${JSON.stringify(environment)};`,
  );
  const compiledSource = typescript.transpileModule(executableSource, {
    compilerOptions: { module: typescript.ModuleKind.ESNext, target: typescript.ScriptTarget.ES2022 },
  }).outputText;
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(compiledSource).toString('base64')}`;
  return import(moduleUrl);
}

function buildWithEnvironment(outputDirectory, environment) {
  execFileSync(
    path.join(projectRoot, 'node_modules/.bin/astro'),
    ['build', '--outDir', outputDirectory],
    {
      cwd: projectRoot,
      encoding: 'utf8',
      env: { ...process.env, ...environment },
      stdio: 'pipe',
    },
  );
}

async function readBuiltHtml(outputDirectory, routePath) {
  const normalized = routePath.replace(/^\/|\/$/g, '');
  const htmlPath = normalized
    ? path.join(outputDirectory, normalized, 'index.html')
    : path.join(outputDirectory, 'index.html');
  return fs.readFile(htmlPath, 'utf8');
}

function externalScriptCount(html, hostname) {
  return [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"[^>]*><\/script>/g)].filter((match) => new URL(match[1]).hostname === hostname).length;
}

test('monetization policy only activates configured tags on substantive content routes after an explicit CMP-ready attestation', async () => {
  // Given: valid public IDs and an explicit certified-CMP deployment attestation.
  const policy = await loadPolicy({
    PUBLIC_ADSENSE_CLIENT: 'ca-pub-1234567890',
    PUBLIC_GA4_ID: 'G-ABCD1234',
    PUBLIC_GOOGLE_CMP_READY: 'true',
    PUBLIC_ADSENSE_CONTENT_READY: 'true',
  }, [verifiedPublicDetailFixture()]);

  // When: public content, legal, utility, and private paths are evaluated.
  const allowedPaths = ['/', '/archive/', '/news/example/', '/category/power-grid/', '/company/example/', '/region/us/'];
  const deniedPaths = ['/privacy/', '/terms/', '/contact/', '/rss.xml', '/sitemap.xml', '/robots.txt', '/ads.txt', '/admin/', '/admin/edit/example/', '/api/admin/'];

  // Then: only the substantive allowlist can activate configured tags.
  assert.equal(policy.adsConfigured, true);
  assert.equal(policy.analyticsConfigured, true);
  assert.equal(policy.googleCmpReady, true);
  for (const routePath of allowedPaths) {
    assert.equal(policy.isMonetizableRoute(routePath), true, `${routePath} should be allowlisted`);
    assert.equal(policy.isMonetizationActiveForRoute(routePath), true, `${routePath} should activate configured tags`);
  }
  for (const routePath of deniedPaths) {
    assert.equal(policy.isMonetizableRoute(routePath), false, `${routePath} should be denied`);
    assert.equal(policy.isMonetizationActiveForRoute(routePath), false, `${routePath} must not activate configured tags`);
  }
});

test('AdSense rejects a stale integrity snapshot when current detail eligibility has been revoked', async () => {
  // Given: configured AdSense/CMP/content flags and a record whose stale snapshot is still ok after rights revocation.
  const environment = {
    PUBLIC_ADSENSE_CLIENT: 'ca-pub-1234567890',
    PUBLIC_GOOGLE_CMP_READY: 'true',
    PUBLIC_ADSENSE_CONTENT_READY: ' TrUe ',
  };
  const revokedSnapshot = {
    ...verifiedPublicDetailFixture(),
    sourceRegistryId: 'revoked-source',
    sourceUrl: 'https://revoked.example/article',
    extraction_artifact: { source_url: 'https://revoked.example/article' },
  };
  const zeroInventoryPolicy = await loadPolicy(environment, []);
  const revokedInventoryPolicy = await loadPolicy(environment, [revokedSnapshot], []);
  const currentInventoryPolicy = await loadPolicy(environment, [revokedSnapshot], [revokedSnapshot]);

  // When: paid-ad activation observes the current detail inventory rather than the snapshot.
  const zeroInventoryAdsEnabled = zeroInventoryPolicy.adsEnabled;
  const revokedInventoryAdsEnabled = revokedInventoryPolicy.adsEnabled;
  const currentInventoryAdsEnabled = currentInventoryPolicy.adsEnabled;

  // Then: a revoked record cannot keep ads enabled, while a current eligible detail can.
  assert.equal(zeroInventoryPolicy.adsenseContentReady, true);
  assert.equal(zeroInventoryPolicy.verifiedPublicDetailCount, 0);
  assert.equal(zeroInventoryAdsEnabled, false);
  assert.equal(revokedInventoryPolicy.verifiedPublicDetailCount, 0);
  assert.equal(revokedInventoryAdsEnabled, false);
  assert.equal(currentInventoryPolicy.verifiedPublicDetailCount, 1);
  assert.equal(currentInventoryAdsEnabled, true);
});

test('monetization policy fails closed for invalid IDs and every non-true CMP-ready value', async () => {
  // Given: malformed IDs or an unready/ambiguous CMP environment value.
  const invalidPolicy = await loadPolicy({
    PUBLIC_ADSENSE_CLIENT: 'ca-pub-placeholder',
    PUBLIC_GA4_ID: 'not-a-measurement-id',
    PUBLIC_GOOGLE_CMP_READY: 'true',
  });
  const unreadyPolicy = await loadPolicy({
    PUBLIC_ADSENSE_CLIENT: 'ca-pub-1234567890',
    PUBLIC_GA4_ID: 'G-ABCD1234',
    PUBLIC_GOOGLE_CMP_READY: 'not-ready',
  });
  const readyPolicy = await loadPolicy({
    PUBLIC_ADSENSE_CLIENT: 'ca-pub-1234567890',
    PUBLIC_GA4_ID: 'G-ABCD1234',
    PUBLIC_GOOGLE_CMP_READY: ' TrUe ',
  });

  // When: their activation state is checked for an otherwise allowlisted page.
  const invalidActive = invalidPolicy.isMonetizationActiveForRoute('/');
  const unreadyActive = unreadyPolicy.isMonetizationActiveForRoute('/');

  // Then: neither can emit third-party tags.
  assert.equal(invalidPolicy.adsConfigured, false);
  assert.equal(invalidPolicy.analyticsConfigured, false);
  assert.equal(invalidActive, false);
  assert.equal(unreadyPolicy.googleCmpReady, false);
  assert.equal(unreadyPolicy.adsConfigured, true);
  assert.equal(unreadyPolicy.analyticsConfigured, true);
  assert.equal(unreadyActive, false);
  assert.equal(readyPolicy.googleCmpReady, true);
});

test('layout uses globally denied Consent Mode v2 defaults and contains no local consent implementation', async () => {
  // Given: the route-gated layout source and any remaining local consent component.
  const layout = await fs.readFile(layoutPath, 'utf8');
  const bannerExists = await fs.access(consentBannerPath).then(() => true, () => false);
  const banner = bannerExists ? await fs.readFile(consentBannerPath, 'utf8') : '';

  // When: source is inspected for the runtime consent contract.
  const source = `${layout}\n${banner}`;

  // Then: no custom choice/storage UI can claim CMP behavior, and defaults remain denied.
  assert.match(layout, /ad_storage:'denied'/);
  assert.match(layout, /ad_user_data:'denied'/);
  assert.match(layout, /ad_personalization:'denied'/);
  assert.match(layout, /analytics_storage:'denied'/);
  assert.match(layout, /ads_data_redaction/);
  assert.doesNotMatch(layout, /ad_storage:'granted'/);
  assert.doesNotMatch(source, /localStorage|ccConsentV1|data-consent-(?:accept|decline)|Allow all|Essential only/);
});

test('synthetic builds omit Google tags until ready and emit each configured loader once on an allowed route', async (context) => {
  // Given: isolated static builds with valid IDs before and after CMP readiness.
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'compute-current-monetization-policy-'));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const disabledOutput = path.join(root, 'disabled');
  const unreadyOutput = path.join(root, 'unready');
  const readyOutput = path.join(root, 'ready');
  const validIds = {
    PUBLIC_ADSENSE_CLIENT: 'ca-pub-1234567890',
    PUBLIC_GA4_ID: 'G-ABCD1234',
    PUBLIC_ADSENSE_SLOT_LEADERBOARD: '1234567890',
    PUBLIC_ADSENSE_CONTENT_READY: 'true',
  };

  // When: the site is built with invalid IDs, without, and with the explicit CMP-ready gate.
  buildWithEnvironment(disabledOutput, {
    PUBLIC_ADSENSE_CLIENT: 'ca-pub-placeholder',
    PUBLIC_GA4_ID: 'not-a-measurement-id',
    PUBLIC_GOOGLE_CMP_READY: 'true',
  });
  buildWithEnvironment(unreadyOutput, { ...validIds, PUBLIC_GOOGLE_CMP_READY: 'false' });
  buildWithEnvironment(readyOutput, { ...validIds, PUBLIC_GOOGLE_CMP_READY: 'true' });
  const disabledHome = await readBuiltHtml(disabledOutput, '/');
  const unreadyHome = await readBuiltHtml(unreadyOutput, '/');
  const readyHome = await readBuiltHtml(readyOutput, '/');
  const readyPrivacy = await readBuiltHtml(readyOutput, '/privacy/');
  const readyTerms = await readBuiltHtml(readyOutput, '/terms/');

  // Then: disabled/unready and denied routes have no Google bootstrap or external scripts.
  for (const html of [disabledHome, unreadyHome, readyPrivacy, readyTerms]) {
    assert.doesNotMatch(html, /googlesyndication|googletagmanager|google-adsense-account|Funding Choices|gtag\(/i);
  }
  assert.equal(externalScriptCount(readyHome, 'pagead2.googlesyndication.com'), 0);
  assert.equal(externalScriptCount(readyHome, 'www.googletagmanager.com'), 1);
  assert.equal((readyHome.match(/google-adsense-account/g) || []).length, 0);
  assert.doesNotMatch(readyHome, /class="adsbygoogle"|data-ad-client=/i);
  assert.match(readyHome, /ad_storage:'denied'/);
  assert.match(readyHome, /ads_data_redaction/);
});
