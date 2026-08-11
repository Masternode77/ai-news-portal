import { isPublicNetworkAddress, normalizeNetworkHost } from './public-network-address.mjs';
import {
  fetchPublicResource,
  PublicNetworkFetchError,
} from './public-network-fetcher.mjs';

export const SOURCE_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
export const SOURCE_IMAGE_MAX_REDIRECTS = 3;
export const SOURCE_IMAGE_TIMEOUT_MS = 20_000;

const ALLOWED_IMAGE_TYPES = [
  'image/avif',
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/webp',
];

const IMAGE_ERROR_CODES = {
  remote_content_type_rejected: 'source_image_not_image',
  remote_fetch_failed: 'source_image_fetch_failed',
  remote_fetch_timeout: 'source_image_fetch_timeout',
  remote_redirect_limit: 'source_image_redirect_limit',
  remote_size_mismatch: 'source_image_size_mismatch',
  remote_size_unknown: 'source_image_size_unknown',
  remote_too_large: 'source_image_too_large',
  unsafe_remote_url: 'unsafe_source_image_url',
};

export class SourceImageFetchError extends Error {
  constructor(code, detail = '') {
    super(detail ? `${code}: ${detail}` : code);
    this.name = 'SourceImageFetchError';
    this.code = code;
    this.detail = detail;
  }
}

export function sourceImageHostsFor(sources = [], sourceId = '') {
  const source = sources.find((entry) => String(entry?.id || '').trim() === String(sourceId || '').trim());
  const configured = source?.image_hosts ?? source?.image_host_allowlist ?? '';
  const values = Array.isArray(configured) ? configured : String(configured).split(/[\s,]+/);
  return [...new Set(values.map(normalizeNetworkHost).filter(Boolean))];
}

export function isPublicAddress(address = '') {
  return isPublicNetworkAddress(address);
}

export async function fetchSourceImage(value, options = {}) {
  try {
    return await fetchPublicResource(value, {
      allowedHosts: options.allowedHosts,
      contentTypes: ALLOWED_IMAGE_TYPES,
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; ComputeCurrentBot/1.0)' },
      maxBytes: options.maxBytes || SOURCE_IMAGE_MAX_BYTES,
      maxRedirects: options.maxRedirects ?? SOURCE_IMAGE_MAX_REDIRECTS,
      request: options.request,
      requireContentLength: true,
      resolveHost: options.resolveHost,
      timeoutMs: options.timeoutMs || SOURCE_IMAGE_TIMEOUT_MS,
    });
  } catch (error) {
    if (!(error instanceof PublicNetworkFetchError)) throw error;
    throw new SourceImageFetchError(IMAGE_ERROR_CODES[error.code] || 'source_image_fetch_failed', error.detail);
  }
}
