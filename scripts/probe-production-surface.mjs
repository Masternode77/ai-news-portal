import { pathToFileURL } from 'node:url';

const REQUIRED_PATHS = ['/', '/column/', '/author/josh-inn/', '/rss.xml', '/sitemap.xml'];
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

export function normalizeExtraPath(value = '') {
  const candidate = String(value || '').trim();
  if (!candidate) return '';
  if (!candidate.startsWith('/') || candidate.startsWith('//') || candidate.includes('\\') || CONTROL_CHARACTERS.test(candidate)) {
    throw new Error('Extra probe must be a same-origin URL path beginning with one slash.');
  }
  let decoded;
  try {
    decoded = decodeURIComponent(candidate);
  } catch {
    throw new Error('Extra probe path contains invalid URL encoding.');
  }
  if (CONTROL_CHARACTERS.test(decoded) || decoded.includes('\\')) {
    throw new Error('Extra probe path contains unsupported characters.');
  }
  const resolved = new URL(candidate, 'https://probe.invalid');
  if (resolved.origin !== 'https://probe.invalid') throw new Error('Extra probe must remain on the production origin.');
  return `${resolved.pathname}${resolved.search}`;
}

function productionOrigin(value) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || (url.pathname !== '/' && url.pathname !== '')) {
    throw new Error('Production base URL must be an HTTP(S) origin.');
  }
  return url.origin;
}

async function fetchSurface(fetchImpl, baseUrl, path) {
  try {
    const response = await fetchImpl(new URL(path, `${baseUrl}/`), {
      redirect: 'follow',
      signal: AbortSignal.timeout(20_000),
      headers: { accept: 'text/html,application/rss+xml,application/xml;q=0.9,*/*;q=0.8' },
    });
    return { path, status: response.status, body: await response.text() };
  } catch (error) {
    return { path, status: 0, body: '', error: error instanceof Error ? error.message : String(error) };
  }
}

function firstColumnPath(columnIndex) {
  const hrefs = [...String(columnIndex).matchAll(/href=["'](?<path>\/column\/[^"'#?]+)["']/g)]
    .map((match) => match.groups?.path || '')
    .filter((path) => path !== '/column/');
  return hrefs[0] || '';
}

export async function runProductionSmoke({
  baseUrl = 'https://www.computecurrent.com',
  extraPath = '',
  fetchImpl = fetch,
} = {}) {
  const origin = productionOrigin(baseUrl);
  const normalizedExtraPath = normalizeExtraPath(extraPath);
  const paths = normalizedExtraPath ? [...REQUIRED_PATHS, normalizedExtraPath] : [...REQUIRED_PATHS];
  const responses = await Promise.all(paths.map((path) => fetchSurface(fetchImpl, origin, path)));
  const responseByPath = new Map(responses.map((response) => [response.path, response]));
  const statuses = Object.fromEntries(responses.map(({ path, status }) => [path, status]));
  const failures = responses
    .filter(({ status }) => status !== 200)
    .map(({ path, status, error }) => `${path} returned HTTP ${status}${error ? ` (${error})` : ''}.`);

  const home = responseByPath.get('/')?.body || '';
  if (!/href=["']\/column\/["']/.test(home)) failures.push('Homepage does not link to the column index.');

  const columnIndex = responseByPath.get('/column/')?.body || '';
  const coreColumnPath = firstColumnPath(columnIndex);
  if (!coreColumnPath) failures.push('Column index does not expose a core column detail link.');

  if (coreColumnPath) {
    const coreColumn = await fetchSurface(fetchImpl, origin, coreColumnPath);
    statuses[coreColumnPath] = coreColumn.status;
    if (coreColumn.status !== 200) failures.push(`${coreColumnPath} returned HTTP ${coreColumn.status}.`);
    if (!/<article(?:\s|>)/i.test(coreColumn.body) || !/<h1(?:\s|>)/i.test(coreColumn.body)) {
      failures.push(`Core column ${coreColumnPath} is missing its article or headline.`);
    }
    if (!coreColumn.body.includes(coreColumnPath)) failures.push(`Core column ${coreColumnPath} is missing its canonical path.`);
  }

  const rss = responseByPath.get('/rss.xml')?.body || '';
  if (!/<(?:rss|feed)(?:\s|>)/i.test(rss)) failures.push('RSS endpoint is not an RSS or Atom document.');
  if (!/\/column\//.test(rss)) failures.push('RSS does not include a column item.');

  return { ok: failures.length === 0, baseUrl: origin, coreColumnPath, statuses, failures };
}

async function main() {
  const result = await runProductionSmoke({ extraPath: process.env.EXTRA_PATH || '' });
  for (const [path, status] of Object.entries(result.statuses)) console.log(`status ${path} -> ${status}`);
  if (result.coreColumnPath) console.log(`core column -> ${result.coreColumnPath}`);
  if (result.failures.length) {
    for (const failure of result.failures) console.error(`smoke failure: ${failure}`);
    process.exitCode = 1;
    return;
  }
  console.log('Production smoke passed.');
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) await main();
