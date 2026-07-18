const CONTROL_OR_WHITESPACE = /[\u0000-\u0020\u007f]/;

function isNonPublicIpv4(hostname) {
  const parts = hostname.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b] = parts;
  return a === 0
    || a === 10
    || a === 127
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && (b === 0 || b === 168))
    || (a === 198 && (b === 18 || b === 19))
    || a >= 224;
}

function isNonPublicHostname(hostname) {
  const value = hostname.replace(/^\[|\]$/g, '').replace(/\.+$/, '').toLowerCase();
  if (
    !value
    || value === 'localhost'
    || value.endsWith('.localhost')
    || value === 'local'
    || value.endsWith('.local')
  ) return true;
  if (isNonPublicIpv4(value)) return true;
  if (!value.includes(':')) return false;
  if (value.startsWith('::')) return true;
  return /^(?:fc|fd|ff)/.test(value) || /^fe[89a-f]/.test(value);
}

export function safePublicHttpUrl(value = '') {
  if (typeof value !== 'string') return '';
  const candidate = value.trim();
  if (!candidate || CONTROL_OR_WHITESPACE.test(candidate)) return '';

  try {
    const parsed = new URL(candidate);
    if (!['http:', 'https:'].includes(parsed.protocol)) return '';
    if (!parsed.hostname || parsed.username || parsed.password || isNonPublicHostname(parsed.hostname)) return '';
    return parsed.href;
  } catch {
    return '';
  }
}

export function safePublicHref(value = '') {
  if (typeof value !== 'string') return '';
  const candidate = value.trim();
  if (!candidate || CONTROL_OR_WHITESPACE.test(candidate) || candidate.includes('\\')) return '';
  if (candidate.startsWith('/') && !candidate.startsWith('//')) return candidate;
  return safePublicHttpUrl(candidate);
}

export function safePublicPath(value = '') {
  const candidate = safePublicHref(value);
  return candidate.startsWith('/') && !candidate.startsWith('//') ? candidate : '';
}

export function firstSafePublicHttpUrl(values = []) {
  for (const value of values) {
    const safeUrl = safePublicHttpUrl(value);
    if (safeUrl) return safeUrl;
  }
  return '';
}
