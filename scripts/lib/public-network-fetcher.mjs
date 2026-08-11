import dns from 'node:dns/promises';
import https from 'node:https';
import net from 'node:net';
import {
  isPublicNetworkAddress,
  normalizeNetworkHost,
} from './public-network-address.mjs';

export class PublicNetworkFetchError extends Error {
  constructor(code, detail = '') {
    super(detail ? `${code}: ${detail}` : code);
    this.name = 'PublicNetworkFetchError';
    this.code = code;
    this.detail = detail;
  }
}

function hostAllowed(hostname, allowedHosts = []) {
  const host = normalizeNetworkHost(hostname);
  return allowedHosts.some((candidate) => {
    const allowed = normalizeNetworkHost(candidate);
    if (allowed.startsWith('*.')) {
      const suffix = allowed.slice(2);
      return host.endsWith(`.${suffix}`) && host !== suffix;
    }
    return host === allowed;
  });
}

function parseTarget(value, allowedHosts) {
  let target;
  try {
    target = new URL(String(value || '').trim());
  } catch {
    throw new PublicNetworkFetchError('unsafe_remote_url', 'malformed_url');
  }
  if (target.protocol !== 'https:') throw new PublicNetworkFetchError('unsafe_remote_url', 'https_required');
  if (target.username || target.password) throw new PublicNetworkFetchError('unsafe_remote_url', 'credentials_not_allowed');
  if (target.port && target.port !== '443') throw new PublicNetworkFetchError('unsafe_remote_url', 'nonstandard_port');
  if (!hostAllowed(target.hostname, allowedHosts)) {
    throw new PublicNetworkFetchError('unsafe_remote_url', 'host_not_allowlisted');
  }
  return target;
}

async function resolveTarget(target, resolveHost) {
  const hostname = normalizeNetworkHost(target.hostname);
  const family = net.isIP(hostname);
  const resolved = family ? [{ address: hostname, family }] : await resolveHost(hostname);
  if (!Array.isArray(resolved) || resolved.length === 0) {
    throw new PublicNetworkFetchError('unsafe_remote_url', 'dns_resolution_empty');
  }
  const normalized = resolved.map((entry) => ({
    address: normalizeNetworkHost(typeof entry === 'string' ? entry : entry?.address),
    family: Number(typeof entry === 'string' ? net.isIP(entry) : entry?.family),
  }));
  if (normalized.some((entry) => !entry.family || !isPublicNetworkAddress(entry.address))) {
    throw new PublicNetworkFetchError('unsafe_remote_url', 'non_public_address');
  }
  return normalized[0];
}

function nodeRequest({ target, address, family, headers, signal }) {
  return new Promise((resolve, reject) => {
    const request = https.request(target, {
      method: 'GET',
      headers,
      signal,
      lookup: (_hostname, lookupOptions, callback) => {
        if (lookupOptions?.all) {
          callback(null, [{ address, family }]);
          return;
        }
        callback(null, address, family);
      },
    }, (response) => resolve({
      status: response.statusCode || 0,
      headers: response.headers,
      body: response,
      cancel: () => {
        response.destroy();
        request.destroy();
      },
    }));
    request.on('error', reject);
    request.end();
  });
}

function header(headers, name) {
  if (typeof headers?.get === 'function') return headers.get(name) || '';
  const value = headers?.[name.toLowerCase()];
  return Array.isArray(value) ? value[0] || '' : String(value || '');
}

async function cancelResponse(response) {
  if (!response) return;
  if (typeof response.cancel === 'function') response.cancel();
  else if (typeof response.destroy === 'function') response.destroy();
  if (typeof response.body?.cancel === 'function') await response.body.cancel().catch(() => {});
  else if (typeof response.body?.return === 'function') await response.body.return().catch(() => {});
}

function abortable(promise, signal) {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(signal.reason);
    signal.addEventListener('abort', onAbort, { once: true });
    Promise.resolve(promise).then(
      (value) => { signal.removeEventListener('abort', onAbort); resolve(value); },
      (error) => { signal.removeEventListener('abort', onAbort); reject(error); },
    );
  });
}

async function boundedBody(response, options, signal) {
  const chunks = [];
  let total = 0;
  const onAbort = () => { void cancelResponse(response); };
  signal.addEventListener('abort', onAbort, { once: true });
  try {
    for await (const chunk of response.body || []) {
      const bytes = Buffer.from(chunk);
      total += bytes.length;
      if (total > options.maxBytes) {
        throw new PublicNetworkFetchError('remote_too_large', 'streamed_body_exceeded_limit');
      }
      chunks.push(bytes);
    }
  } catch (error) {
    await cancelResponse(response);
    throw error;
  } finally {
    signal.removeEventListener('abort', onAbort);
  }
  if (signal.aborted) throw new PublicNetworkFetchError('remote_fetch_timeout');
  if (options.expectedBytes !== null && total !== options.expectedBytes) {
    throw new PublicNetworkFetchError('remote_size_mismatch', 'content_length_did_not_match_body');
  }
  return Buffer.concat(chunks, total);
}

async function fetchWithSignal(value, options, signal) {
  const resolveHost = options.resolveHost || ((hostname) => dns.lookup(hostname, { all: true, verbatim: true }));
  const request = options.request || nodeRequest;
  let target = parseTarget(value, options.allowedHosts || []);
  for (let redirects = 0; ; redirects += 1) {
    if (redirects > options.maxRedirects) throw new PublicNetworkFetchError('remote_redirect_limit');
    const endpoint = await abortable(resolveTarget(target, resolveHost), signal);
    const response = await abortable(request({
      target,
      ...endpoint,
      signal,
      headers: options.headers,
    }), signal);
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = header(response.headers, 'location');
      await cancelResponse(response);
      if (!location) throw new PublicNetworkFetchError('remote_fetch_failed', 'redirect_without_location');
      target = parseTarget(new URL(location, target).href, options.allowedHosts || []);
      continue;
    }
    if (response.status < 200 || response.status >= 300) {
      await cancelResponse(response);
      throw new PublicNetworkFetchError('remote_fetch_failed', `status_${response.status}`);
    }
    const contentType = header(response.headers, 'content-type').split(';', 1)[0].trim().toLowerCase();
    if (!contentType || !options.contentTypes.includes(contentType)) {
      await cancelResponse(response);
      throw new PublicNetworkFetchError('remote_content_type_rejected', contentType ? 'unsupported' : 'missing');
    }
    const contentLength = header(response.headers, 'content-length');
    if (contentLength && !/^\d+$/.test(contentLength)) {
      await cancelResponse(response);
      throw new PublicNetworkFetchError('remote_size_unknown', 'content_length_invalid');
    }
    if (!contentLength && options.requireContentLength) {
      await cancelResponse(response);
      throw new PublicNetworkFetchError('remote_size_unknown', 'content_length_missing');
    }
    const expectedBytes = contentLength ? Number(contentLength) : null;
    if (expectedBytes !== null && (!Number.isSafeInteger(expectedBytes) || expectedBytes > options.maxBytes)) {
      await cancelResponse(response);
      throw new PublicNetworkFetchError('remote_too_large', 'content_length_exceeded_limit');
    }
    return {
      bytes: await boundedBody(response, { maxBytes: options.maxBytes, expectedBytes }, signal),
      contentType,
      finalUrl: target.href,
    };
  }
}

export async function fetchPublicResource(value, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || 12_000);
  try {
    return await fetchWithSignal(value, {
      allowedHosts: options.allowedHosts || [],
      contentTypes: options.contentTypes || [],
      headers: options.headers || {},
      maxBytes: options.maxBytes || 2 * 1024 * 1024,
      maxRedirects: options.maxRedirects ?? 3,
      requireContentLength: options.requireContentLength === true,
      request: options.request,
      resolveHost: options.resolveHost,
    }, controller.signal);
  } catch (error) {
    if (controller.signal.aborted) throw new PublicNetworkFetchError('remote_fetch_timeout');
    if (error instanceof PublicNetworkFetchError) throw error;
    throw new PublicNetworkFetchError('remote_fetch_failed', error?.message || 'request_failed');
  } finally {
    clearTimeout(timeout);
  }
}
