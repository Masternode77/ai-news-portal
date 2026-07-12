import { createHmac, randomUUID } from 'node:crypto';
import { AdminStorageError } from '../../src/plugins/storage/index.mjs';
import { json } from './_auth.js';

function header(req, name) {
  const value = req.headers?.[name] || req.headers?.[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : String(value || '');
}

function statusForError(error, code) {
  if (error?.statusCode) return error.statusCode;
  if (code === 'article_not_found') return 404;
  if (code === 'version_conflict') return 409;
  if (code === 'expected_version_required') return 428;
  if (code === 'admin_action_forbidden') return 403;
  if (['missing_title', 'invalid_patch', 'invalid_expected_version', 'invalid_schedule', 'invalid_url', 'invalid_media_data', 'invalid_media_size', 'invalid_media_type', 'invalid_media_image', 'invalid_media_key', 'delete_confirmation_required', 'soft_delete_required'].includes(code)) return 400;
  if (['database_url_required', 'production_storage_required', 'production_media_storage_required', 'blob_token_required', 'sql_client_required'].includes(code)) return 503;
  return 500;
}

export function requestContext(req, session) {
  const ip = header(req, 'x-forwarded-for').split(',')[0].trim() || req.socket?.remoteAddress || 'unknown';
  return {
    actor: { id: session.sub, role: session.role },
    role: session.role,
    sessionId: session.sid,
    requestId: header(req, 'x-vercel-id') || header(req, 'x-request-id') || randomUUID(),
    ipHash: createHmac('sha256', process.env.ADMIN_SESSION_SECRET || 'unconfigured')
      .update(ip)
      .digest('hex'),
  };
}

export function adminError(res, error) {
  const code = error?.code || error?.message || 'admin_request_failed';
  const status = statusForError(error, code);
  let safeMessage = 'Admin request failed.';
  if (status >= 500) safeMessage = 'Admin service is temporarily unavailable.';
  else if (error instanceof AdminStorageError) safeMessage = error.message;
  else if (status === 400 && code === 'invalid_json') safeMessage = 'Invalid JSON request body.';
  json(res, status, { error: safeMessage, code: status >= 500 ? 'admin_unavailable' : code });
}
