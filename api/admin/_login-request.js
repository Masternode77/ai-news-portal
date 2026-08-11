const MAX_LOGIN_BODY_BYTES = 4 * 1024;
const MAX_LOGIN_USERNAME_LENGTH = 256;
const MAX_LOGIN_PASSWORD_LENGTH = 1024;
const MAX_ADMIN_ARTICLE_BODY_BYTES = 256 * 1024;
const MAX_ADMIN_ARTICLE_FIELDS = 26;
const MAX_ADMIN_ARTICLE_TEXT_LENGTH = 4096;
const MAX_ADMIN_ARTICLE_LONG_TEXT_LENGTH = 200000;
const ADMIN_ARTICLE_FIELDS = new Set([
  'id', 'action', 'expectedSourceSha', 'title', 'dek', 'summary', 'bodyMarkdown', 'finalArticleBody',
  'expertLensShort', 'category', 'region', 'source', 'sourceUrl', 'canonicalUrl', 'sourceImage',
  'generatedImage', 'heroImage', 'thumbnailImage', 'imageAlt', 'imagePrompt', 'publishedAt',
  'metaDescription', 'tags', 'replacementImage', 'public_status',
]);
const ADMIN_ARTICLE_LONG_TEXT_FIELDS = new Set(['bodyMarkdown', 'finalArticleBody', 'imagePrompt']);

export class RequestBodyError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

function headerValue(req, name) {
  const value = req.headers?.[name] || req.headers?.[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : String(value || '');
}

function contentLength(req) {
  const value = headerValue(req, 'content-length');
  if (!value) return 0;
  if (!/^\d+$/.test(value)) throw new RequestBodyError(400, 'Invalid request body.');
  const bytes = Number(value);
  if (!Number.isSafeInteger(bytes)) throw new RequestBodyError(400, 'Invalid request body.');
  return bytes;
}

async function readBoundedJson(req, maxBytes, tooLargeMessage, invalidMessage) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    bytes += buffer.length;
    if (bytes > maxBytes) throw new RequestBodyError(413, tooLargeMessage);
    chunks.push(buffer);
  }
  if (!bytes) throw new RequestBodyError(400, invalidMessage);
  try {
    return JSON.parse(Buffer.concat(chunks, bytes).toString('utf8'));
  } catch {
    throw new RequestBodyError(400, invalidMessage);
  }
}

function isLoginCredentials(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const fields = Object.keys(value);
  if (fields.length !== 2 || !fields.includes('username') || !fields.includes('password')) return false;
  return typeof value.username === 'string'
    && typeof value.password === 'string'
    && value.username.length <= MAX_LOGIN_USERNAME_LENGTH
    && value.password.length <= MAX_LOGIN_PASSWORD_LENGTH;
}

export async function readLoginJson(req) {
  const contentType = headerValue(req, 'content-type').split(';', 1)[0].trim().toLowerCase();
  if (contentType && contentType !== 'application/json') {
    throw new RequestBodyError(415, 'Login requests must use application/json.');
  }
  if (contentLength(req) > MAX_LOGIN_BODY_BYTES) {
    throw new RequestBodyError(413, 'Login request body is too large.');
  }
  const body = await readBoundedJson(req, MAX_LOGIN_BODY_BYTES, 'Login request body is too large.', 'Invalid login request.');
  if (!isLoginCredentials(body)) {
    throw new RequestBodyError(400, 'Login request must include username and password.');
  }
  return body;
}

function isAdminArticlePayload(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const fields = Object.keys(value);
  if (!fields.length || fields.length > MAX_ADMIN_ARTICLE_FIELDS || !fields.every((field) => ADMIN_ARTICLE_FIELDS.has(field))) return false;
  if (typeof value.id !== 'string' || !value.id || value.id.length > 256) return false;
  return fields.every((field) => {
    const fieldValue = value[field];
    if (field === 'tags') {
      return Array.isArray(fieldValue)
        ? fieldValue.length <= 50 && fieldValue.every((tag) => typeof tag === 'string' && tag.length <= 128)
        : typeof fieldValue === 'string' && fieldValue.length <= MAX_ADMIN_ARTICLE_TEXT_LENGTH;
    }
    if (typeof fieldValue !== 'string') return false;
    const limit = ADMIN_ARTICLE_LONG_TEXT_FIELDS.has(field) ? MAX_ADMIN_ARTICLE_LONG_TEXT_LENGTH : MAX_ADMIN_ARTICLE_TEXT_LENGTH;
    return fieldValue.length <= limit;
  });
}

export async function readAdminArticleJson(req) {
  const contentType = headerValue(req, 'content-type').split(';', 1)[0].trim().toLowerCase();
  if (contentType !== 'application/json') {
    throw new RequestBodyError(415, 'Admin article requests must use application/json.');
  }
  if (contentLength(req) > MAX_ADMIN_ARTICLE_BODY_BYTES) {
    throw new RequestBodyError(413, 'Admin article request body is too large.');
  }
  const body = await readBoundedJson(req, MAX_ADMIN_ARTICLE_BODY_BYTES, 'Admin article request body is too large.', 'Invalid admin article request.');
  if (!isAdminArticlePayload(body)) throw new RequestBodyError(400, 'Invalid admin article request.');
  return body;
}
