import dns from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import { PassThrough, Transform, Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createBrotliDecompress, createGunzip, createInflate } from 'node:zlib';

const DEFAULT_MAX_COMPRESSED_BYTES = 16 * 1024 * 1024;
const DEFAULT_MAX_DECOMPRESSED_BYTES = 24 * 1024 * 1024;
const DEFAULT_MAX_REDIRECTS = 4;
const DEFAULT_TIMEOUT_MS = 20_000;
const CROSS_ORIGIN_CREDENTIAL_HEADERS = [
  'authorization',
  'cookie',
  'proxy-authorization',
  'x-goog-api-key',
  'x-api-key',
  'api-key',
  'apikey',
  'x-auth-token',
  'x-access-token',
];

const IPV4_BLOCKS = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.31.196.0', 24],
  ['192.52.193.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['192.175.48.0', 24],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
];

const IPV6_BLOCKS = [
  ['::', 96],
  ['::', 128],
  ['::1', 128],
  ['::ffff:0:0', 96],
  ['64:ff9b::', 96],
  ['64:ff9b:1::', 48],
  ['100::', 64],
  ['2001::', 23],
  ['2001:db8::', 32],
  ['2002::', 16],
  ['3fff::', 20],
  ['5f00::', 16],
  ['fc00::', 7],
  ['fe80::', 10],
  ['fec0::', 10],
  ['ff00::', 8],
];

function ipv4Number(address) {
  const parts = String(address).split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return null;
  }
  return parts.reduce((value, part) => ((value * 256) + part) >>> 0, 0);
}

function ipv4InCidr(address, network, prefix) {
  const value = ipv4Number(address);
  const base = ipv4Number(network);
  if (value === null || base === null) return false;
  if (prefix === 0) return true;
  const mask = (0xffffffff << (32 - prefix)) >>> 0;
  return (value & mask) === (base & mask);
}

function ipv6Number(address) {
  let value = String(address).toLowerCase().split('%')[0];
  const mapped = value.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) {
    const ipv4 = ipv4Number(mapped[1]);
    return ipv4 === null ? null : (0xffffn << 32n) | BigInt(ipv4);
  }

  if (value.includes('.')) {
    const lastColon = value.lastIndexOf(':');
    const ipv4 = ipv4Number(value.slice(lastColon + 1));
    if (ipv4 === null) return null;
    value = `${value.slice(0, lastColon)}:${((ipv4 >>> 16) & 0xffff).toString(16)}:${(ipv4 & 0xffff).toString(16)}`;
  }

  const sides = value.split('::');
  if (sides.length > 2) return null;
  const left = sides[0] ? sides[0].split(':') : [];
  const right = sides[1] ? sides[1].split(':') : [];
  const missing = 8 - left.length - right.length;
  if ((sides.length === 1 && missing !== 0) || missing < 0) return null;
  const groups = sides.length === 2 ? [...left, ...Array(missing).fill('0'), ...right] : left;
  if (groups.length !== 8 || groups.some((group) => !/^[0-9a-f]{1,4}$/.test(group))) return null;
  return groups.reduce((result, group) => (result << 16n) | BigInt(`0x${group}`), 0n);
}

function ipv6InCidr(address, network, prefix) {
  const value = ipv6Number(address);
  const base = ipv6Number(network);
  if (value === null || base === null) return false;
  const shift = BigInt(128 - prefix);
  return (value >> shift) === (base >> shift);
}

export function isPublicIpAddress(address = '') {
  const normalized = String(address).replace(/^\[|\]$/g, '').split('%')[0];
  const family = net.isIP(normalized);
  if (family === 4) {
    return !IPV4_BLOCKS.some(([network, prefix]) => ipv4InCidr(normalized, network, prefix));
  }
  if (family === 6) {
    const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
    if (mapped) return isPublicIpAddress(mapped[1]);
    return !IPV6_BLOCKS.some(([network, prefix]) => ipv6InCidr(normalized, network, prefix));
  }
  return false;
}

function parseHttpUrl(value) {
  let parsed;
  try {
    parsed = value instanceof URL ? new URL(value.href) : new URL(String(value));
  } catch {
    throw new Error('Outbound URL must be a valid HTTP(S) URL');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Outbound URL must use HTTP(S)');
  }
  if (parsed.username || parsed.password) {
    throw new Error('Outbound URL credentials are not allowed');
  }
  return parsed;
}

export async function resolveSafeHttpTarget(value, options = {}) {
  const url = parseHttpUrl(value);
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  const family = net.isIP(hostname);
  const lookupPromise = family
    ? Promise.resolve([{ address: hostname, family }])
    : (options.lookup || dns.lookup)(hostname, { all: true, verbatim: true });
  let records;
  if (options.timeoutMs) {
    let timeout;
    try {
      records = await Promise.race([
        lookupPromise,
        new Promise((_, reject) => {
          timeout = setTimeout(() => reject(new Error('Outbound DNS lookup timed out')), options.timeoutMs);
          timeout.unref?.();
        }),
      ]);
    } finally {
      clearTimeout(timeout);
    }
  } else {
    records = await lookupPromise;
  }
  const normalized = Array.isArray(records) ? records : [records];

  if (!normalized.length || normalized.some((record) => !isPublicIpAddress(record?.address))) {
    throw new Error('Outbound destination resolved to a non-public IP address');
  }

  const selected = normalized[0];
  return {
    url,
    address: selected.address,
    family: Number(selected.family) || net.isIP(selected.address),
    addresses: normalized.map((record) => ({
      address: record.address,
      family: Number(record.family) || net.isIP(record.address),
    })),
  };
}

function normalizedAllowedDomain(value = '') {
  return String(value).trim().replace(/^www\./, '').replace(/\.+$/, '').toLowerCase();
}

function assertAllowedDomain(value, allowedDomains) {
  if (allowedDomains === undefined) return;
  if (!Array.isArray(allowedDomains) || allowedDomains.length === 0) {
    throw new Error('Outbound source requires at least one registered domain');
  }
  const hostname = parseHttpUrl(value).hostname.replace(/^www\./, '').replace(/\.+$/, '').toLowerCase();
  const allowed = allowedDomains.some((domain) => {
    const normalized = normalizedAllowedDomain(domain);
    return normalized && (hostname === normalized || hostname.endsWith(`.${normalized}`));
  });
  if (!allowed) throw new Error('Outbound redirect target is outside the registered domain set');
}

export function validateRedirectTarget(currentValue, location, options = {}) {
  const current = parseHttpUrl(currentValue);
  let next;
  try {
    next = parseHttpUrl(new URL(String(location), current));
  } catch {
    throw new Error('Redirect target must be a valid HTTP(S) URL');
  }
  if (current.protocol === 'https:' && next.protocol !== 'https:') {
    throw new Error('HTTPS redirect downgrade is not allowed');
  }
  assertAllowedDomain(next, options.allowedDomains);
  return next;
}

function byteLimiter(label, maximum) {
  let count = 0;
  return new Transform({
    transform(chunk, _encoding, callback) {
      count += chunk.length;
      if (count > maximum) {
        callback(new Error(`${label} exceeds ${maximum} bytes`));
        return;
      }
      callback(null, chunk);
    },
  });
}

function decompressorFor(contentEncoding = '') {
  const encoding = String(contentEncoding).trim().toLowerCase();
  if (!encoding || encoding === 'identity') return new PassThrough();
  if (encoding === 'gzip' || encoding === 'x-gzip') return createGunzip();
  if (encoding === 'deflate') return createInflate();
  if (encoding === 'br') return createBrotliDecompress();
  throw new Error(`Unsupported content encoding: ${encoding}`);
}

export async function readLimitedResponseBody(stream, options = {}) {
  const maxCompressedBytes = options.maxCompressedBytes || DEFAULT_MAX_COMPRESSED_BYTES;
  const maxDecompressedBytes = options.maxDecompressedBytes || DEFAULT_MAX_DECOMPRESSED_BYTES;
  const chunks = [];
  const collector = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(Buffer.from(chunk));
      callback();
    },
  });

  await pipeline(
    stream,
    byteLimiter('Compressed response', maxCompressedBytes),
    decompressorFor(options.contentEncoding),
    byteLimiter('Decompressed response', maxDecompressedBytes),
    collector,
  );
  return Buffer.concat(chunks);
}

class BufferedSafeResponse {
  constructor({ statusCode, statusMessage, headers, body, url }) {
    this.status = statusCode;
    this.statusText = statusMessage || '';
    this.headers = new Headers();
    for (const [name, value] of Object.entries(headers || {})) {
      if (Array.isArray(value)) {
        for (const entry of value) this.headers.append(name, entry);
      } else if (value !== undefined) {
        this.headers.set(name, String(value));
      }
    }
    this.ok = statusCode >= 200 && statusCode < 300;
    this.url = url.href;
    this.redirected = false;
    this._body = body;
  }

  async arrayBuffer() {
    return this._body.buffer.slice(this._body.byteOffset, this._body.byteOffset + this._body.byteLength);
  }

  async text() {
    return this._body.toString('utf8');
  }

  async json() {
    return JSON.parse(await this.text());
  }
}

function mimeAllowed(contentType, allowedMimeTypes = []) {
  if (!allowedMimeTypes.length) return true;
  const mime = String(contentType || '').split(';')[0].trim().toLowerCase();
  return allowedMimeTypes.some((allowed) => (
    allowed instanceof RegExp ? allowed.test(mime) : mime === String(allowed).toLowerCase()
  ));
}

function requestOnce(target, options) {
  return new Promise((resolve, reject) => {
    const { url, address, family } = target;
    const client = url.protocol === 'https:' ? https : http;
    const body = options.body === undefined || options.body === null
      ? null
      : Buffer.isBuffer(options.body)
        ? options.body
        : typeof options.body === 'string' || ArrayBuffer.isView(options.body)
          ? Buffer.from(options.body)
          : null;
    if (options.body !== undefined && options.body !== null && body === null) {
      reject(new Error('Outbound request body must be a string or byte buffer'));
      return;
    }
    const maxRequestBytes = options.maxRequestBytes || 2 * 1024 * 1024;
    if (body && body.length > maxRequestBytes) {
      reject(new Error(`Outbound request body exceeds ${maxRequestBytes} bytes`));
      return;
    }
    const safeHeaders = new Headers(options.headers || {});
    for (const name of ['host', 'connection', 'proxy-connection', 'transfer-encoding', 'upgrade', 'content-length']) {
      safeHeaders.delete(name);
    }
    if (!safeHeaders.has('accept-encoding')) safeHeaders.set('accept-encoding', 'gzip, deflate, br');
    if (body) safeHeaders.set('content-length', String(body.length));
    const headers = Object.fromEntries(safeHeaders.entries());

    const request = client.request({
      protocol: url.protocol,
      hostname: url.hostname.replace(/^\[|\]$/g, ''),
      port: url.port || undefined,
      path: `${url.pathname}${url.search}`,
      method: options.method || 'GET',
      headers,
      servername: net.isIP(url.hostname.replace(/^\[|\]$/g, '')) ? undefined : url.hostname,
      family,
      autoSelectFamily: false,
      lookup(_hostname, lookupOptions, callback) {
        if (lookupOptions?.all) {
          callback(null, [{ address, family }]);
          return;
        }
        callback(null, address, family);
      },
    }, (response) => resolve({ request, response }));

    const timeout = setTimeout(() => request.destroy(new Error('Outbound request timed out')), options.timeoutMs);
    timeout.unref?.();
    request.once('close', () => clearTimeout(timeout));
    request.once('error', reject);

    if (options.signal) {
      const abort = () => request.destroy(options.signal.reason || new Error('Outbound request aborted'));
      if (options.signal.aborted) abort();
      else options.signal.addEventListener('abort', abort, { once: true });
      request.once('close', () => options.signal.removeEventListener('abort', abort));
    }

    if (body) request.write(body);
    request.end();
  });
}

export function redirectedRequestOptions(statusCode, options, from, to) {
  const next = { ...options };
  if (statusCode === 303 || ((statusCode === 301 || statusCode === 302) && String(options.method || 'GET').toUpperCase() === 'POST')) {
    next.method = 'GET';
    next.body = undefined;
    const headers = new Headers(next.headers || {});
    headers.delete('content-length');
    headers.delete('content-type');
    next.headers = Object.fromEntries(headers.entries());
  }
  if (from.origin !== to.origin) {
    const method = String(next.method || 'GET').toUpperCase();
    if (method !== 'GET' && method !== 'HEAD') {
      throw new Error('Cross-origin redirect for non-idempotent request is not allowed');
    }
    const headers = new Headers(next.headers || {});
    for (const name of CROSS_ORIGIN_CREDENTIAL_HEADERS) headers.delete(name);
    next.headers = Object.fromEntries(headers.entries());
  }
  return next;
}

export async function safeHttpFetch(value, options = {}) {
  const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
  const deadline = Date.now() + timeoutMs;
  let currentUrl = parseHttpUrl(value);
  assertAllowedDomain(currentUrl, options.allowedDomains);
  let requestOptions = {
    ...options,
    timeoutMs,
  };

  for (let redirects = 0; redirects <= maxRedirects; redirects += 1) {
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) throw new Error('Outbound request timed out');
    const target = await resolveSafeHttpTarget(currentUrl, {
      lookup: options.lookup,
      timeoutMs: remainingMs,
    });
    let response;
    let lastError;
    for (const resolved of target.addresses) {
      const requestRemainingMs = deadline - Date.now();
      if (requestRemainingMs <= 0) throw new Error('Outbound request timed out');
      try {
        ({ response } = await requestOnce(
          { ...target, ...resolved },
          { ...requestOptions, timeoutMs: requestRemainingMs },
        ));
        break;
      } catch (error) {
        lastError = error;
      }
    }
    if (!response) throw lastError || new Error('Outbound request failed');
    const statusCode = response.statusCode || 0;
    const location = response.headers.location;

    if ([301, 302, 303, 307, 308].includes(statusCode) && location) {
      response.destroy();
      if (redirects === maxRedirects) throw new Error(`Outbound redirect limit exceeded (${maxRedirects})`);
      const nextUrl = validateRedirectTarget(currentUrl, location, {
        allowedDomains: options.allowedDomains,
      });
      requestOptions = redirectedRequestOptions(statusCode, requestOptions, currentUrl, nextUrl);
      currentUrl = nextUrl;
      continue;
    }

    const contentLength = Number(response.headers['content-length'] || 0);
    const maxCompressedBytes = requestOptions.maxCompressedBytes || DEFAULT_MAX_COMPRESSED_BYTES;
    if (Number.isFinite(contentLength) && contentLength > maxCompressedBytes) {
      response.destroy();
      throw new Error(`Compressed response exceeds ${maxCompressedBytes} bytes`);
    }
    if (statusCode >= 200 && statusCode < 300 && !mimeAllowed(response.headers['content-type'], requestOptions.allowedMimeTypes)) {
      response.destroy();
      throw new Error(`Unsupported response MIME type: ${response.headers['content-type'] || 'missing'}`);
    }

    const bodyRemainingMs = deadline - Date.now();
    if (bodyRemainingMs <= 0) {
      response.destroy();
      throw new Error('Outbound request timed out');
    }
    const bodyTimeout = setTimeout(
      () => response.destroy(new Error('Outbound response body timed out')),
      bodyRemainingMs,
    );
    bodyTimeout.unref?.();
    let body;
    try {
      body = await readLimitedResponseBody(response, {
        contentEncoding: response.headers['content-encoding'],
        maxCompressedBytes,
        maxDecompressedBytes: requestOptions.maxDecompressedBytes,
      });
    } finally {
      clearTimeout(bodyTimeout);
    }
    const result = new BufferedSafeResponse({
      statusCode,
      statusMessage: response.statusMessage,
      headers: response.headers,
      body,
      url: currentUrl,
    });
    result.redirected = redirects > 0;
    return result;
  }

  throw new Error('Outbound redirect limit exceeded');
}
