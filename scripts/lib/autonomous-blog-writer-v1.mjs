import {
  EDITORIAL_ARTICLE_V2_VERSION,
  writeAutonomousBlogArticleV2,
} from './editorial-blog-writer-v2.mjs';

export function writeAutonomousBlogArticle(cluster = {}, options = {}) {
  return writeAutonomousBlogArticleV2(cluster, options);
}

export { EDITORIAL_ARTICLE_V2_VERSION };
