export function parseBasicAuth(header = '') {
  if (!header.startsWith('Basic ')) return null;
  try {
    const encoded = header.slice(6);
    const decoded = typeof atob === 'function'
      ? atob(encoded)
      : Buffer.from(encoded, 'base64').toString('utf8');
    const splitAt = decoded.indexOf(':');
    if (splitAt === -1) return null;
    return {
      username: decoded.slice(0, splitAt),
      password: decoded.slice(splitAt + 1),
    };
  } catch {
    return null;
  }
}

export function adminRouteAuthResult(header = '', env = {}) {
  const expectedPassword = env.ADMIN_PAGE_PASSWORD || env.ADMIN_PASSWORD || '';
  const expectedUsername = env.ADMIN_PAGE_USERNAME || env.ADMIN_USERNAME || '';

  if (!expectedPassword) {
    return { ok: false, status: 404, reason: 'admin_route_disabled' };
  }

  const credentials = parseBasicAuth(header);
  if (!credentials) {
    return { ok: false, status: 401, reason: 'missing_basic_auth' };
  }

  if (expectedUsername && credentials.username !== expectedUsername) {
    return { ok: false, status: 401, reason: 'invalid_basic_auth' };
  }

  if (credentials.password !== expectedPassword) {
    return { ok: false, status: 401, reason: 'invalid_basic_auth' };
  }

  return { ok: true, status: 200, reason: 'authorized' };
}
