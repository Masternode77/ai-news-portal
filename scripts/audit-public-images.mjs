import fs from 'node:fs';
import path from 'node:path';
import latestNews from '../src/data/latest-news.json' with { type: 'json' };
import archivedNews from '../src/data/archived-news.json' with { type: 'json' };
import searchIndex from '../src/data/search-index.json' with { type: 'json' };
import taxonomyPages from '../src/data/taxonomy-pages.json' with { type: 'json' };
import { buildArchiveFeed } from './lib/archive-feed-builder.mjs';
import { buildHomepageFeed } from './lib/homepage-feed-builder.mjs';
import { isPublicLongformArticle } from './lib/public-surface-eligibility.mjs';
import {
  articleCardImage,
  articleDisplayImage,
  articleImageAlt,
  isRemoteImage,
  localArticleImageExists,
} from './lib/article-image-surface.mjs';
import { isStockDerivedCardImage } from './lib/stock-card-image-detector.mjs';

function uniqueById(items = []) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    if (!item?.id || seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
}

function taxonomyItems() {
  const pages = [
    ...(taxonomyPages.categories || []),
    ...(taxonomyPages.companies || []),
    ...(taxonomyPages.regions || []),
    ...(taxonomyPages.archive || []),
  ];
  return uniqueById(pages.flatMap((page) => page.items || []));
}

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return full;
  });
}

function publicPathFromDistHtml(file, distRoot = path.join(process.cwd(), 'dist')) {
  const relative = path.relative(distRoot, file).replaceAll(path.sep, '/');
  if (relative === 'index.html') return '/';
  return `/${relative.replace(/\/index\.html$/, '/').replace(/\.html$/, '/')}`;
}

function isPublicRenderedPath(publicPath = '') {
  const normalized = `/${String(publicPath || '').replace(/^\/+/, '')}`;
  return normalized !== '/dashboard/'
    && normalized !== '/dashboard'
    && normalized !== '/admin.html/'
    && normalized !== '/admin.html'
    && normalized !== '/admin/'
    && normalized !== '/admin'
    && !normalized.startsWith('/admin/')
    && !normalized.startsWith('/api/admin/');
}

export function discoverRenderedPublicImageFiles(distRoot = path.join(process.cwd(), 'dist')) {
  return walk(distRoot)
    .filter((file) => /\.html$/i.test(file))
    .map((file) => ({ path: publicPathFromDistHtml(file, distRoot), file }))
    .filter((entry) => isPublicRenderedPath(entry.path));
}

function normalizeRenderedPublicPath(publicPath = '') {
  const normalized = `/${String(publicPath || '').replace(/^\/+/, '')}`;
  return normalized.endsWith('/') ? normalized : `${normalized}/`;
}

export function renderedPublicCoverageFailures({ renderedFiles = discoverRenderedPublicImageFiles(), longform = [] } = {}) {
  const renderedPaths = new Set(renderedFiles.map((entry) => normalizeRenderedPublicPath(entry.path)));
  const failures = [];
  if (renderedFiles.length === 0) {
    failures.push('rendered-public-html:missing_all_public_html');
  }
  for (const expectedPath of ['/', '/archive/']) {
    if (!renderedPaths.has(expectedPath)) {
      failures.push(`rendered-public-html:missing_expected_path:${expectedPath}`);
    }
  }
  for (const item of longform) {
    const expectedPath = `/news/${item.id}/`;
    if (!renderedPaths.has(expectedPath)) {
      failures.push(`rendered-public-html:missing_longform_path:${item.id}:${expectedPath}`);
    }
  }
  return failures;
}

function attrValue(tag = '', name = '') {
  const pattern = new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i');
  const match = pattern.exec(tag);
  return match?.[1] || match?.[2] || match?.[3] || '';
}

export function renderedImageFailures(publicPath = '/', html = '') {
  const failures = [];
  const tags = [...String(html || '').matchAll(/<img\b[^>]*>/gi)].map((match) => match[0]);
  tags.forEach((tag, index) => {
    const label = `${publicPath}:img[${index}]`;
    const src = attrValue(tag, 'src').trim();
    const alt = attrValue(tag, 'alt').trim();
    if (!src) {
      failures.push(`${label}:missing_src`);
      return;
    }
    if (!alt) {
      failures.push(`${label}:missing_alt:${src}`);
    }
    if (isRemoteImage(src)) {
      failures.push(`${label}:remote_image:${src}`);
      return;
    }
    if (!localArticleImageExists(src)) {
      failures.push(`${label}:missing_local_asset:${src}`);
    }
  });
  return failures;
}

function renderedPublicImageFailures(files = discoverRenderedPublicImageFiles()) {
  return files.flatMap(({ path: publicPath, file }) => {
    if (!fs.existsSync(file)) return [`${publicPath}:missing_rendered_html:${file}`];
    return renderedImageFailures(publicPath, fs.readFileSync(file, 'utf8'));
  });
}

export function publicImageSurfaceFailures(surface = 'public', items = []) {
  return items.flatMap((item) => {
    const id = item?.id || 'unknown';
    const image = item?.publicSignal?.image || item?.public_presentation?.image || articleCardImage(item);
    const alt = item?.publicSignal?.image_alt || item?.public_presentation?.image_alt || articleImageAlt(item);
    const failures = [];
    if (!image) {
      failures.push(`${surface}:${id}:missing_public_image`);
      return failures;
    }
    if (!alt) failures.push(`${surface}:${id}:missing_public_image_alt:${image}`);
    if (isRemoteImage(image)) {
      failures.push(`${surface}:${id}:remote_public_image:${image}`);
      return failures;
    }
    if (!localArticleImageExists(image)) failures.push(`${surface}:${id}:missing_local_asset:${image}`);
    const publicImageProvider = item?.publicSignal?.image_provider
      || item?.public_presentation?.image_provider
      || item?.generatedImageProvider
      || item?.imageProvider
      || item?.image_source_provider;
    const publicImageSurface = {
      ...(item?.public_presentation || {}),
      ...(item?.publicSignal || {}),
      sourceImage: item?.sourceImage || item?.publicSignal?.sourceImage || item?.public_presentation?.sourceImage,
      imageUrl: item?.imageUrl || item?.publicSignal?.imageUrl || item?.public_presentation?.imageUrl,
      image_url: item?.image_url || item?.publicSignal?.image_url || item?.public_presentation?.image_url,
      thumbnail: item?.thumbnail || item?.publicSignal?.thumbnail || item?.public_presentation?.thumbnail,
      image,
      generatedImageProvider: publicImageProvider,
      imageProvider: publicImageProvider,
      image_source_provider: publicImageProvider,
    };
    if (String(publicImageProvider || '').trim().toLowerCase() !== 'source-image' && isStockDerivedCardImage(publicImageSurface)) {
      failures.push(`${surface}:${id}:stock_derived_public_image:${image}`);
    }
    return failures;
  });
}

export function auditPublicImages({ distRoot = path.join(process.cwd(), 'dist') } = {}) {
  const allArticles = [...latestNews, ...archivedNews];
  const homepage = buildHomepageFeed(allArticles, { limit: 50, minimumVisible: 30 });
  const archive = buildArchiveFeed(allArticles, { page: 1, pageSize: 1000 });
  const longform = allArticles.filter(isPublicLongformArticle);
  const taxonomy = taxonomyItems();
  const renderedFiles = discoverRenderedPublicImageFiles(distRoot);
  const failures = [
    ...renderedPublicCoverageFailures({ renderedFiles, longform }),
    ...renderedPublicImageFailures(renderedFiles),
    ...publicImageSurfaceFailures('homepage', homepage.items),
    ...publicImageSurfaceFailures('archive-feed', archive.items),
    ...publicImageSurfaceFailures('search-index', searchIndex),
    ...publicImageSurfaceFailures('taxonomy', taxonomy),
    ...longform
      .filter((item) => !articleDisplayImage(item))
      .map((item) => `longform:${item.id}:missing_article_image`),
  ];

  return {
    ok: failures.length === 0,
    failures,
    counts: {
      latest: latestNews.length,
      archive: archivedNews.length,
      search: searchIndex.length,
      taxonomy: taxonomy.length,
      renderedPages: renderedFiles.length,
      homepage: homepage.items.length,
      archiveFeed: archive.items.length,
      longform: longform.length,
    },
  };
}

if (process.argv[1] && import.meta.url === new URL(`file://${path.resolve(process.argv[1])}`).href) {
  const result = auditPublicImages();
  if (!result.ok) {
    console.error(`public image audit failed:\n${result.failures.slice(0, 80).join('\n')}`);
    process.exitCode = 1;
  } else {
    console.log(
      `public image audit passed: renderedPages=${result.counts.renderedPages}, latest=${result.counts.latest}, archive=${result.counts.archive}, search=${result.counts.search}, taxonomy=${result.counts.taxonomy}, homepage=${result.counts.homepage}, archiveFeed=${result.counts.archiveFeed}, longform=${result.counts.longform}`
    );
  }
}
