import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_OUT = path.join(ROOT, 'evidence/homepage-images-http-audit.json');
const REQUEST_TIMEOUT_MS = 10000;

function usage() {
  return [
    'Usage: node scripts/audit-homepage-images-http.mjs --base-url <url> [options]',
    '',
    'Options:',
    '  --base-url <url>       Homepage base URL to audit.',
    '  --out <path>           JSON evidence path.',
    '  --blocked-host <host>  Reject image hosts matching this host. Repeatable.',
    '  --require-src <src>    Require an img src value or resolved URL. Repeatable.',
    '  --help                Show this help text.',
  ].join('\n');
}

function pushRepeatable(args, key, value) {
  if (!args[key]) args[key] = [];
  args[key].push(value);
}

export function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    out: DEFAULT_OUT,
    blockedHost: [],
    requireSrc: [],
  };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === '--help') {
      args.help = true;
      continue;
    }
    if (!flag.startsWith('--')) continue;
    const value = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : '';
    if (flag === '--blocked-host') {
      pushRepeatable(args, 'blockedHost', value);
    } else if (flag === '--require-src') {
      pushRepeatable(args, 'requireSrc', value);
    } else {
      args[flag.slice(2)] = value;
    }
  }
  return args;
}

function normalizeHost(host = '') {
  return String(host).trim().toLowerCase().replace(/^\.+|\.+$/g, '');
}

function hostMatchesBlocked(host = '', blockedHosts = []) {
  const normalized = normalizeHost(host);
  return blockedHosts.map(normalizeHost).filter(Boolean).some((blocked) => normalized === blocked || normalized.endsWith(`.${blocked}`));
}

function decodeHtmlAttribute(value = '') {
  return value
    .replaceAll('&amp;', '&')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>');
}

function attributeValue(tag = '', name = '') {
  const patterns = {
    src: /\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/i,
    srcset: /\bsrcset\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/i,
  };
  const pattern = patterns[name];
  if (!pattern) return '';
  const match = tag.match(pattern);
  return decodeHtmlAttribute(match?.[1] || match?.[2] || match?.[3] || '').trim();
}

function srcsetCandidates(srcset = '') {
  return srcset.split(',').map((candidate) => {
    const parts = candidate.trim().split(/\s+/).filter(Boolean);
    return {
      src: parts[0] || '',
      descriptor: parts.slice(1).join(' '),
    };
  }).filter((candidate) => candidate.src);
}

export function extractImageCandidates(html = '') {
  const candidates = [];
  const imageTagPattern = /<(img|source)\b[^>]*>/gi;
  for (const match of html.matchAll(imageTagPattern)) {
    const tag = match[0];
    const tagName = match[1].toLowerCase();
    const src = tagName === 'img' ? attributeValue(tag, 'src') : '';
    if (src) {
      candidates.push({ src, tagName, attribute: 'src' });
    }

    const srcset = attributeValue(tag, 'srcset');
    for (const candidate of srcsetCandidates(srcset)) {
      candidates.push({
        src: candidate.src,
        tagName,
        attribute: 'srcset',
        ...(candidate.descriptor ? { descriptor: candidate.descriptor } : {}),
      });
    }
  }
  return candidates;
}

export function extractImageSources(html = '') {
  return extractImageCandidates(html).map((candidate) => candidate.src);
}

async function fetchText(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, { redirect: 'follow', signal: controller.signal });
    const text = await response.text().catch(() => '');
    return { ok: response.ok, status: response.status, text };
  } catch (error) {
    return { ok: false, error: error.name === 'AbortError' ? 'timeout' : error.message, text: '' };
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchImage(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, { redirect: 'follow', signal: controller.signal });
    const contentType = response.headers.get('content-type') || '';
    const body = await response.arrayBuffer().catch(() => new ArrayBuffer(0));
    const hasImageContentType = contentType.toLowerCase().split(';', 1)[0].trim().startsWith('image/');
    const ok = response.status >= 200 && response.status < 300 && hasImageContentType;
    return {
      ok,
      status: response.status,
      contentType,
      bytes: body.byteLength,
      reason: response.ok && !hasImageContentType ? 'nonImageContentType' : undefined,
    };
  } catch (error) {
    return { ok: false, error: error.name === 'AbortError' ? 'timeout' : error.message };
  } finally {
    clearTimeout(timeout);
  }
}

function requiredSourceResults(requiredSources = [], imageRecords = []) {
  return requiredSources.map((required) => ({
    src: required,
    present: imageRecords.some((image) => image.src === required || image.url === required),
  }));
}

export async function auditHomepageImagesHttp(options = {}) {
  if (!options['base-url']) {
    throw new Error('missing required --base-url');
  }
  const baseUrl = new URL(options['base-url']);
  const homepageUrl = new URL('/', baseUrl).toString();
  const homepage = await fetchText(homepageUrl);
  const rawSources = homepage.ok ? extractImageCandidates(homepage.text) : [];
  const images = rawSources.map((candidate) => {
    const url = new URL(candidate.src, homepageUrl);
    return {
      ...candidate,
      url: url.toString(),
      host: url.host,
      blocked: hostMatchesBlocked(url.hostname, options.blockedHost || []),
    };
  });

  const checkedImages = [];
  for (const image of images) {
    if (image.blocked) {
      checkedImages.push({ ...image, ok: false, reason: 'blockedHost' });
      continue;
    }
    checkedImages.push({ ...image, ...(await fetchImage(image.url)) });
  }

  const requiredSources = requiredSourceResults(options.requireSrc || [], checkedImages);
  const missingRequired = requiredSources.filter((source) => !source.present);
  const failedImages = checkedImages.filter((image) => !image.ok);
  const ok = homepage.ok && failedImages.length === 0 && missingRequired.length === 0;
  return {
    ok,
    baseUrl: baseUrl.toString(),
    homepage: {
      url: homepageUrl,
      ok: homepage.ok,
      status: homepage.status,
      error: homepage.error,
    },
    images: checkedImages,
    failedImages,
    requiredSources,
    missingRequiredSources: missingRequired,
    blockedHosts: options.blockedHost || [],
  };
}

async function main() {
  const args = parseArgs();
  if (args.help) {
    console.log(usage());
    return;
  }
  let result;
  try {
    result = await auditHomepageImagesHttp(args);
  } catch (error) {
    result = {
      ok: false,
      error: error.message,
      images: [],
      failedImages: [],
      requiredSources: [],
      missingRequiredSources: [],
      blockedHosts: args.blockedHost || [],
    };
  }
  const out = path.resolve(ROOT, args.out || DEFAULT_OUT);
  await fs.mkdir(path.dirname(out), { recursive: true });
  await fs.writeFile(out, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  if (!result.ok) {
    console.error(`homepage image HTTP audit failed: ${out}`);
    process.exitCode = 1;
    return;
  }
  console.log(`homepage image HTTP audit passed: images=${result.images.length}, out=${out}`);
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  await main();
}
