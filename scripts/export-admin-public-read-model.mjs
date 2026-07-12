import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ADMIN_PUBLIC_READ_MODEL_PATH } from '../src/lib/admin-public-read-model.js';
import { createAdminStorage } from '../src/plugins/storage/index.mjs';

const DEFAULT_OUTPUT = ADMIN_PUBLIC_READ_MODEL_PATH;

function isPublicArticle(article) {
  return !article.deletedAt
    && article.public_status === 'published'
    && article.articlePagePublished === true
    && article.draft !== true
    && article.hidden !== true
    && article.noindex !== true
    && article.seo_noindex !== true;
}

function outputFromArgs(argv) {
  const index = argv.indexOf('--output');
  return index >= 0 && argv[index + 1] ? path.resolve(argv[index + 1]) : DEFAULT_OUTPUT;
}

async function atomicWriteJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.tmp`;
  try {
    await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
    await fs.rename(temporary, filePath);
  } finally {
    await fs.rm(temporary, { force: true });
  }
}

export async function exportAdminPublicReadModel({ storage, mediaStorage, outputPath = DEFAULT_OUTPUT } = {}) {
  const ownsStorage = !storage;
  const adapter = storage || createAdminStorage();
  try {
    const [articles, events] = await Promise.all([
      adapter.listArticles({ includeDeleted: true }),
      adapter.listPublicationOutbox({ pendingOnly: true, limit: 1000 }),
    ]);
    let publicArticles = articles
      .filter(isPublicArticle)
      .sort((a, b) => String(b.publishedAt || b.updatedAt || '').localeCompare(String(a.publishedAt || a.updatedAt || '')));
    if (mediaStorage) {
      publicArticles = await Promise.all(publicArticles.map(async (article) => {
        const next = structuredClone(article);
        const mediaById = new Map((await adapter.listMedia({ articleId: article.id })).map((record) => [record.id, record]));
        for (const field of ['heroImage', 'thumbnailImage', 'generatedImage']) {
          const value = String(next[field] || '');
          if (!value.startsWith('/api/admin/media?')) continue;
          const params = new URL(value, 'https://admin.local').searchParams;
          const mediaId = params.get('id');
          const articleId = params.get('articleId');
          const record = mediaId && articleId === article.id ? mediaById.get(mediaId) : null;
          if (!record) throw new Error(`article ${article.id} has an unattached private media reference`);
          next[field] = await mediaStorage.publishImage(record.objectKey);
        }
        return next;
      }));
    }
    await atomicWriteJson(path.resolve(outputPath), {
      articles: publicArticles,
      ownedIds: articles.map((article) => article.id).sort(),
    });
    return { outputPath: path.resolve(outputPath), articleCount: publicArticles.length, pendingEvents: events.length };
  } finally {
    if (ownsStorage && typeof adapter.close === 'function') await adapter.close();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const argv = process.argv.slice(2);
  const ifConfigured = argv.includes('--if-configured');
  const outputPath = outputFromArgs(argv);
  const skipped = { skipped: true, outputPath, articleCount: 0, pendingEvents: 0 };
  const run = ifConfigured && !process.env.DATABASE_URL
    ? fs.rm(skipped.outputPath, { force: true }).then(() => skipped)
    : import('../src/plugins/storage/admin-media-storage.mjs').then(({ createAdminMediaStorage }) => exportAdminPublicReadModel({
      outputPath,
      mediaStorage: process.env.DATABASE_URL ? createAdminMediaStorage() : null,
    }));
  run
    .then((result) => console.log(`[admin:export] articles=${result.articleCount || 0} pending=${result.pendingEvents || 0}${result.outputPath ? ` -> ${result.outputPath}` : ''}`))
    .catch((error) => {
      console.error(`[admin:export] ${error.message}`);
      process.exitCode = 1;
    });
}
