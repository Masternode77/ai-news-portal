import crypto from 'node:crypto';
import { authorizeAdminAction, json, readJson, requireAdmin } from './_auth.js';
import { adminError, requestContext } from './_request.js';
import { getAdminMediaStorage } from './_media-storage.js';
import { getAdminStorage } from './_storage.js';

const MAX_MEDIA_JSON_BYTES = 4 * 1024 * 1024;

function decodeBase64(value) {
  const input = String(value || '');
  const invalid = () => {
    const error = new Error('invalid_media_data');
    error.code = 'invalid_media_data';
    error.statusCode = 400;
    throw error;
  };
  if (!input || input.length > MAX_MEDIA_JSON_BYTES || input.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(input)) {
    invalid();
  }
  const decoded = Buffer.from(input, 'base64');
  if (!decoded.length || decoded.toString('base64') !== input) invalid();
  return decoded;
}

export default async function handler(req, res) {
  const session = await requireAdmin(req, res, { csrf: req.method === 'POST' });
  if (!session) return;
  try {
    const mediaStorage = getAdminMediaStorage();
    if (req.method === 'GET') {
      authorizeAdminAction(session, 'media:read');
      const params = new URL(req.url || '/', 'https://admin.local').searchParams;
      const mediaId = params.get('id') || '';
      const articleId = params.get('articleId') || '';
      if (!mediaId || !articleId) return json(res, 404, { error: 'Media not found.' });
      const storage = await getAdminStorage();
      if (!await storage.getArticle(articleId, { includeDeleted: false })) return json(res, 404, { error: 'Media not found.' });
      const record = (await storage.listMedia({ articleId })).find((media) => media.id === mediaId);
      if (!record) return json(res, 404, { error: 'Media not found.' });
      let bytes;
      try {
        bytes = await mediaStorage.read(record.objectKey);
      } catch (error) {
        if (['ENOENT', 'invalid_media_key'].includes(error?.code)) return json(res, 404, { error: 'Media not found.' });
        throw error;
      }
      res.statusCode = 200;
      res.setHeader('Content-Type', 'image/webp');
      res.setHeader('Cache-Control', 'private, no-store');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.end(bytes);
      return;
    }
    if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed.' }, { Allow: 'GET, POST' });
    authorizeAdminAction(session, 'media:upload');
    const body = await readJson(req, { maxBytes: MAX_MEDIA_JSON_BYTES });
    const articleId = String(body.articleId || '').trim();
    if (!articleId) return json(res, 400, { error: 'Missing article id.' });
    const storage = await getAdminStorage();
    const article = await storage.getArticle(articleId, { includeDeleted: false });
    if (!article) return json(res, 404, { error: 'Article not found.' });
    const liveArticle = ['published', 'scheduled'].includes(String(article.public_status || '').toLowerCase())
      || article.articlePagePublished === true
      || article.homepagePublished === true;
    if (session.role === 'editor' && liveArticle) return json(res, 403, { error: 'Admin action not allowed.' });
    const uploaded = await mediaStorage.saveImage({
      articleId,
      buffer: decodeBase64(body.data),
      contentType: String(body.contentType || '').toLowerCase(),
    });
    try {
      const context = requestContext(req, session);
      const id = crypto.randomUUID();
      const media = await storage.createMedia({
        id,
        articleId,
        objectKey: uploaded.objectKey,
        url: `/api/admin/media?id=${encodeURIComponent(id)}&articleId=${encodeURIComponent(articleId)}`,
        contentType: uploaded.contentType,
        byteSize: uploaded.byteSize,
        width: uploaded.width,
        height: uploaded.height,
        checksum: uploaded.checksum,
        altText: String(body.altText || '').trim(),
        metadata: { originalName: String(body.name || '').slice(0, 160), provider: mediaStorage.provider },
      }, { actor: context.actor, metadata: context });
      json(res, 201, { ok: true, media });
    } catch (error) {
      await mediaStorage.remove(uploaded).catch(() => {});
      throw error;
    }
  } catch (error) {
    adminError(res, error);
  }
}
