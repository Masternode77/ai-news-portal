import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = path.join(ROOT, 'scripts/audit-homepage-images-http.mjs');

function execNode(args = []) {
  return new Promise((resolve) => {
    execFile(process.execPath, args, { cwd: ROOT }, (error, stdout, stderr) => {
      resolve({
        code: error?.code ?? 0,
        stdout,
        stderr,
      });
    });
  });
}

function createServer(handler) {
  const server = http.createServer(handler);
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('test server did not provide a TCP address'));
        return;
      }
      resolve({
        baseUrl: `http://127.0.0.1:${address.port}`,
        close: () =>
          new Promise((closeResolve, closeReject) => {
            server.close((error) => (error ? closeReject(error) : closeResolve()));
          }),
      });
    });
  });
}

async function tempJsonPath(name) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'homepage-image-audit-'));
  return path.join(dir, `${name}.json`);
}

test('passes reachable homepage images', async () => {
  const server = await createServer((request, response) => {
    if (request.url === '/') {
      response.writeHead(200, { 'content-type': 'text/html' });
      response.end([
        '<main>',
        '<picture>',
        '<source srcset="/generated/card-wide.webp 1200w, /generated/card-narrow.webp 600w" type="image/webp">',
        '<img src="/generated/card.svg" srcset="/generated/card@2x.svg 2x" alt="Card">',
        '</picture>',
        '<img src="./relative.png" alt="Relative">',
        '</main>',
      ].join(''));
      return;
    }
    if (request.url === '/generated/card.svg' || request.url === '/generated/card@2x.svg') {
      response.writeHead(200, { 'content-type': 'image/svg+xml' });
      response.end('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
      return;
    }
    if (request.url === '/generated/card-wide.webp' || request.url === '/generated/card-narrow.webp') {
      response.writeHead(200, { 'content-type': 'image/webp' });
      response.end('webp');
      return;
    }
    if (request.url === '/relative.png') {
      response.writeHead(200, { 'content-type': 'image/png' });
      response.end('png');
      return;
    }
    response.writeHead(404);
    response.end('missing');
  });

  try {
    const out = await tempJsonPath('pass');
    const result = await execNode([
      SCRIPT,
      '--base-url',
      server.baseUrl,
      '--out',
      out,
      '--require-src',
      '/generated/card.svg',
      '--blocked-host',
      'blocked.example.com',
    ]);
    const evidence = JSON.parse(await fs.readFile(out, 'utf8'));

    assert.equal(result.code, 0, result.stderr || result.stdout);
    assert.equal(evidence.ok, true);
    assert.deepEqual(evidence.failedImages, []);
    assert.equal(evidence.images.length, 5);
    assert.equal(evidence.images.find((image) => image.src === '/generated/card.svg')?.status, 200);
    assert.equal(evidence.images.find((image) => image.src === '/generated/card.svg')?.contentType, 'image/svg+xml');
    assert.equal(evidence.images.find((image) => image.src === '/generated/card@2x.svg')?.attribute, 'srcset');
    assert.equal(evidence.images.find((image) => image.src === '/generated/card-wide.webp')?.tagName, 'source');
    assert.equal(evidence.images.find((image) => image.src === '/generated/card-narrow.webp')?.descriptor, '600w');
    assert.equal(evidence.images.find((image) => image.src === './relative.png')?.status, 200);
    assert.equal(evidence.images.find((image) => image.src === './relative.png')?.contentType, 'image/png');
    assert.equal(evidence.requiredSources[0].present, true);
  } finally {
    await server.close();
  }
});

test('fails blocked or forbidden images', async () => {
  const server = await createServer((request, response) => {
    if (request.url === '/') {
      response.writeHead(200, { 'content-type': 'text/html' });
      response.end([
        '<picture>',
        '<source srcset="https://cdn.hpcwire.com/blocked-srcset.webp 1x, /forbidden-srcset.webp 2x">',
        '<img src="https://www.hpcwire.com/blocked.png" srcset="/forbidden.png 1x">',
        '</picture>',
      ].join(''));
      return;
    }
    if (request.url === '/forbidden.png' || request.url === '/forbidden-srcset.webp') {
      response.writeHead(403, { 'content-type': 'text/plain' });
      response.end('forbidden');
      return;
    }
    response.writeHead(404);
    response.end('missing');
  });

  try {
    const blockedOut = await tempJsonPath('blocked');
    const blocked = await execNode([
      SCRIPT,
      '--base-url',
      server.baseUrl,
      '--out',
      blockedOut,
      '--blocked-host',
      'hpcwire.com',
    ]);
    const blockedEvidence = JSON.parse(await fs.readFile(blockedOut, 'utf8'));

    assert.notEqual(blocked.code, 0);
    assert.equal(blockedEvidence.ok, false);
    assert.equal(blockedEvidence.failedImages.some((image) => image.reason === 'blockedHost' && image.host === 'www.hpcwire.com'), true);
    assert.equal(blockedEvidence.failedImages.some((image) => image.reason === 'blockedHost' && image.host === 'cdn.hpcwire.com'), true);

    const forbiddenOut = await tempJsonPath('forbidden');
    const forbidden = await execNode([SCRIPT, '--base-url', server.baseUrl, '--out', forbiddenOut]);
    const forbiddenEvidence = JSON.parse(await fs.readFile(forbiddenOut, 'utf8'));

    assert.notEqual(forbidden.code, 0);
    assert.equal(forbiddenEvidence.ok, false);
    assert.equal(forbiddenEvidence.failedImages.some((image) => image.status === 403), true);
    assert.equal(forbiddenEvidence.failedImages.some((image) => image.src === '/forbidden-srcset.webp' && image.status === 403), true);
  } finally {
    await server.close();
  }
});

test('fails 200 image URLs served as non-image content', async () => {
  const server = await createServer((request, response) => {
    if (request.url === '/') {
      response.writeHead(200, { 'content-type': 'text/html' });
      response.end('<img src="/not-an-image.png" alt="Not an image">');
      return;
    }
    if (request.url === '/not-an-image.png') {
      response.writeHead(200, { 'content-type': 'text/plain' });
      response.end('not image bytes');
      return;
    }
    response.writeHead(404);
    response.end('missing');
  });

  try {
    const out = await tempJsonPath('non-image-content-type');
    const result = await execNode([SCRIPT, '--base-url', server.baseUrl, '--out', out]);
    const evidence = JSON.parse(await fs.readFile(out, 'utf8'));
    const failedImage = evidence.failedImages.find((image) => image.src === '/not-an-image.png');

    assert.notEqual(result.code, 0);
    assert.equal(evidence.ok, false);
    assert.equal(failedImage?.status, 200);
    assert.equal(failedImage?.contentType, 'text/plain');
    assert.equal(failedImage?.reason, 'nonImageContentType');
  } finally {
    await server.close();
  }
});
