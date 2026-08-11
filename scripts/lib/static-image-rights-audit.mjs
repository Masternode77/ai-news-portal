import fs from 'node:fs';
import path from 'node:path';
import { sourceUsageDecision } from './source-registry.mjs';

const STATIC_IMAGE_EXTENSION_RE = /\.(?:avif|gif|jpe?g|png|svg|webp)$/i;
const LEGACY_SOURCE_POSTER_RE = /^\/generated\/([^/]+)\.jpe?g$/i;

function walkFiles(root) {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(root, entry.name);
    return entry.isDirectory() ? walkFiles(file) : [file];
  });
}

export function enumerateStaticImages(root) {
  return walkFiles(root)
    .filter((file) => STATIC_IMAGE_EXTENSION_RE.test(file))
    .map((file) => ({
      file,
      publicPath: `/${path.relative(root, file).split(path.sep).join('/')}`,
    }))
    .sort((left, right) => left.publicPath.localeCompare(right.publicPath));
}

export function auditStaticImageRights({ root, rootLabel, articles = [], sources = [], now = new Date() }) {
  const images = enumerateStaticImages(root);
  const articlesById = new Map(articles.filter((article) => article?.id).map((article) => [article.id, article]));
  const failures = [];
  let legacySourcePosters = 0;

  for (const image of images) {
    const match = LEGACY_SOURCE_POSTER_RE.exec(image.publicPath);
    if (!match) continue;
    legacySourcePosters += 1;
    const article = articlesById.get(match[1]);
    if (!article) {
      failures.push(`static-image:${rootLabel}:${image.publicPath}:orphan_legacy_source_poster`);
      continue;
    }
    const authorization = sourceUsageDecision(article, sources, 'image', now);
    if (!authorization.authorized) {
      failures.push(`static-image:${rootLabel}:${image.publicPath}:${authorization.reason}`);
    }
  }

  return { failures, imageCount: images.length, legacySourcePosters };
}
