import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { buildArticleStructuredData } from '../src/lib/seo-safeguards.js';

const root = path.resolve(import.meta.dirname, '..');
const removedRoutes = [
  '/about/',
  '/editorial-policy/',
  '/methodology/',
  '/ai-disclosure/',
  '/contact/',
];
const removedRouteFiles = [
  'src/pages/about.astro',
  'src/pages/editorial-policy.astro',
  'src/pages/methodology.astro',
  'src/pages/ai-disclosure.astro',
  'src/pages/contact.astro',
];

const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

function filesUnder(relativePath, suffixes) {
  const directory = path.join(root, relativePath);
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const child = path.join(relativePath, entry.name);
    if (entry.isDirectory()) return filesUnder(child, suffixes);
    return suffixes.some((suffix) => entry.name.endsWith(suffix)) ? [child] : [];
  });
}

test('retired operational page source files are absent', () => {
  for (const relativePath of removedRouteFiles) {
    assert.equal(fs.existsSync(path.join(root, relativePath)), false, `${relativePath} must remain deleted`);
  }
});

test('all public surfaces contain no retired links or labels', () => {
  const publicFiles = [
    ...filesUnder('src/components', ['.astro']),
    ...filesUnder('src/layouts', ['.astro']),
    ...filesUnder('src/pages', ['.astro']),
    'src/config/site.ts',
    'src/pages/robots.txt.ts',
    'src/lib/seo-safeguards.js',
  ];
  const source = publicFiles.map(read).join('\n');

  for (const route of removedRoutes) {
    assert.doesNotMatch(source, new RegExp(route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
  }
  for (const label of ['How we source', 'Editorial policy', 'AI-assisted disclosure', 'Share a source']) {
    assert.doesNotMatch(source, new RegExp(label, 'i'));
  }
  assert.doesNotMatch(source, /correctionPolicy|publishingPrinciples/);
});

test('deployment and visual QA scripts do not require retired routes', () => {
  const operationalScripts = [
    'scripts/verify-production-surface.mjs',
    'scripts/qa-commercial-visual.mjs',
    'scripts/lib/source-feed-discovery.mjs',
  ].map(read).join('\n');

  for (const route of removedRoutes) {
    assert.doesNotMatch(operationalScripts, new RegExp(route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('sitemap and RSS endpoints exclude every retired route', () => {
  const sitemapSource = read('src/pages/sitemap.xml.ts');
  const sitemapBuilderSource = read('scripts/lib/sitemap-builder.mjs');
  const rssSource = read('src/pages/rss.xml.ts');

  for (const route of removedRoutes) {
    assert.doesNotMatch(sitemapSource, new RegExp(route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.doesNotMatch(sitemapBuilderSource, new RegExp(route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.match(rssSource, new RegExp(route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(sitemapSource, /import \{ publicContentInventory \} from '\.\.\/lib\/public-content-inventory\.js'/);
  assert.match(sitemapSource, /buildSitemapEntries\(publicContentInventory\)/);
  assert.match(rssSource, /buildRssItems\(publicContentInventory\)/);
  assert.match(rssSource, /filter\(\(item\) => !pointsToRemovedRoute\(item\.link, meta\.site\)\)/);
});

test('article schema keeps provenance while omitting retired policy links', () => {
  const schema = buildArticleStructuredData({
    article: {
      id: 'source-preservation',
      title: 'Power capacity changes the delivery window',
      source: 'Grid Journal',
      sourceUrl: 'https://example.com/original-report',
      publishedAt: '2026-07-11T00:00:00Z',
      primary_category: 'Power & Grid',
    },
    site: {
      name: 'Compute Current',
      url: 'https://www.computecurrent.com',
      defaultOgImage: '/og-default.svg',
    },
    title: 'Power capacity changes the delivery window',
    description: 'Grid access changes the commissioning schedule.',
    image: '/generated/example.webp',
    canonicalUrl: 'https://www.computecurrent.com/news/source-preservation/',
    taxonomy: { primary: 'Power & Grid' },
    articleBody: ['Source-grounded analysis.'],
  });

  assert.equal(schema.citation, 'https://example.com/original-report');
  assert.equal(schema.isBasedOn?.name, 'Grid Journal');
  assert.equal(schema.isBasedOn?.url, 'https://example.com/original-report');
  assert.equal(schema.datePublished, '2026-07-11T00:00:00Z');
  assert.equal(schema.articleSection, 'Power & Grid');
  assert.equal('correctionPolicy' in schema, false);
  assert.equal('publishingPrinciples' in schema, false);
});

test('robots keeps admin surfaces excluded without naming retired routes', () => {
  const robots = read('src/pages/robots.txt.ts');
  assert.match(robots, /Disallow: \/admin\//);
  assert.match(robots, /Disallow: \/api\/admin\//);
  for (const route of removedRoutes) {
    assert.doesNotMatch(robots, new RegExp(route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('rendered build omits retired routes from files, sitemap, and RSS', {
  skip: !process.env.PUBLIC_BUILD_DIR,
}, () => {
  const buildDir = path.resolve(process.env.PUBLIC_BUILD_DIR);
  for (const routeFile of removedRouteFiles) {
    const routeName = path.basename(routeFile, '.astro');
    assert.equal(
      fs.existsSync(path.join(buildDir, routeName, 'index.html')),
      false,
      `build must not emit /${routeName}/`,
    );
  }

  const sitemapFiles = fs.readdirSync(buildDir)
    .filter((name) => /^sitemap(?:-index|-\d+)?\.xml$/.test(name));
  const sitemaps = sitemapFiles
    .map((name) => fs.readFileSync(path.join(buildDir, name), 'utf8'))
    .join('\n');
  const rss = fs.readFileSync(path.join(buildDir, 'rss.xml'), 'utf8');
  for (const route of removedRoutes) {
    assert.doesNotMatch(sitemaps, new RegExp(route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.doesNotMatch(rss, new RegExp(route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.doesNotMatch(sitemaps, /\/admin(?:\/|%2F)/i);
  assert.doesNotMatch(rss, /\/admin(?:\/|%2F)/i);

  const articlePath = fs.readdirSync(path.join(buildDir, 'news'))
    .map((id) => path.join(buildDir, 'news', id, 'index.html'))
    .find((filePath) => fs.existsSync(filePath));
  assert.ok(articlePath, 'build must contain at least one public article');
  const article = fs.readFileSync(articlePath, 'utf8');
  assert.match(article, /<time\s+datetime=/i, 'article must retain its publication date');
  assert.match(article, /Source/i, 'article must retain source attribution');
  assert.match(article, /href="https?:\/\//i, 'article must retain an original-source link');
  assert.match(article, /class="category-badge">[^<]+<\/span>/i, 'article must retain its category metadata');
  for (const route of removedRoutes) {
    assert.doesNotMatch(article, new RegExp(route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});
