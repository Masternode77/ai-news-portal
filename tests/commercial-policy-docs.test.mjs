import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve();
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('privacy policy is a tag-free utility page with accurate Google disclosures and revocation guidance', () => {
  const privacy = read('src/pages/privacy.astro');

  assert.match(privacy, /adsConfigured/);
  assert.match(privacy, /adsEnabled/);
  assert.match(privacy, /analyticsConfigured/);
  assert.match(privacy, /analyticsEnabled/);
  assert.match(privacy, /googleCmpReady/);
  assert.match(privacy, /policies\.google\.com\/technologies\/partner-sites/);
  assert.match(privacy, /Privacy choices/i);
  assert.match(privacy, /EU\/EEA, UK, or Switzerland/i);
  assert.doesNotMatch(privacy, /googletagmanager\.com|pagead2\.googlesyndication\.com|googlefc/i);
  assert.doesNotMatch(privacy, /never sell|never blocks|will respond within 30 days/i);
});

test('ads.txt remains an honest ownership record for a configured client before CMP activation', () => {
  const adsTxt = read('src/pages/ads.txt.ts');

  assert.match(adsTxt, /adsConfigured/);
  assert.match(adsTxt, /adsensePubId/);
  assert.doesNotMatch(adsTxt, /\badsEnabled\b/);
  assert.match(adsTxt, /text\/plain; charset=utf-8/);
});

test('Vercel sets static-compatible security headers without enforcing a CSP', () => {
  const config = JSON.parse(read('vercel.json'));
  const rules = config.headers;

  assert.ok(Array.isArray(rules), 'vercel.json must declare header rules');
  const allHeaders = rules.flatMap((rule) => rule.headers ?? []);
  const headerValue = (key) => allHeaders.find((header) => header.key === key)?.value;
  const adsTxtRule = rules.find((rule) => rule.source === '/ads.txt');

  assert.equal(headerValue('X-Content-Type-Options'), 'nosniff');
  assert.equal(headerValue('Referrer-Policy'), 'strict-origin-when-cross-origin');
  assert.equal(headerValue('X-Frame-Options'), 'SAMEORIGIN');
  assert.match(headerValue('Permissions-Policy') ?? '', /camera=\(\), microphone=\(\), geolocation=\(\)/);
  assert.equal(allHeaders.some((header) => header.key.toLowerCase() === 'content-security-policy'), false);
  assert.equal(
    adsTxtRule?.headers?.find((header) => header.key === 'Content-Type')?.value,
    'text/plain; charset=utf-8',
  );
});

test('operator documentation separates configuration, certified-CMP activation, and external account work', () => {
  const env = read('.env.example');
  const setup = read('docs/monetization-setup.md');
  const checklist = read('docs/commercialization-deploy-checklist.md');
  const runbook = read('docs/adsense-operations-runbook.md');
  const docs = [setup, checklist, runbook].join('\n');

  assert.match(env, /^PUBLIC_GOOGLE_CMP_READY=/m);
  assert.match(docs, /PUBLIC_GOOGLE_CMP_READY/);
  assert.match(docs, /certified Google CMP/i);
  assert.match(docs, /(?:do not set.*PUBLIC_GOOGLE_CMP_READY.*until|Keep.*PUBLIC_GOOGLE_CMP_READY=false.*until)/i);
  assert.match(docs, /invalid[- ]traffic/i);
  assert.match(docs, /do not.*click.*ads/i);
  assert.match(docs, /legal entity/i);
  assert.match(docs, /retention/i);
  assert.doesNotMatch(docs, /1\s*[–-]\s*4\s*weeks|meaningful ad(?:vertising)? revenue|guarantee.*approval/i);
});

test('initial activation documentation keeps Auto ads and CSP changes behind separately evidenced follow-ups', () => {
  const env = read('.env.example');
  const setup = read('docs/monetization-setup.md');
  const checklist = read('docs/commercialization-deploy-checklist.md');
  const runbook = read('docs/adsense-operations-runbook.md');
  const docs = [setup, checklist, runbook].join('\n');

  assert.match(env, /PUBLIC_GOOGLE_CMP_READY=false/);
  assert.match(docs, /account.*site approval/i);
  assert.match(docs, /real.*ads\.txt.*ID/i);
  assert.match(docs, /EEA\/UK\/CH.*accept.*reject.*revoke/i);
  assert.match(docs, /legal review/i);
  assert.match(docs, /Auto ads.*disabled.*post-approval.*production DOM.*placement.*accessibility/i);
  assert.match(docs, /risk acceptance.*no enforced CSP/i);
  assert.match(docs, /report-only.*collector/i);
  assert.match(docs, /per-request nonce-capable architecture/i);
});

test('AdSense content readiness requires reviewed original inventory beyond an environment attestation', () => {
  const env = read('.env.example');
  const setup = read('docs/monetization-setup.md');
  const checklist = read('docs/commercialization-deploy-checklist.md');
  const runbook = read('docs/adsense-operations-runbook.md');
  const docs = [setup, checklist, runbook].join('\n');

  assert.match(env, /^PUBLIC_ADSENSE_CONTENT_READY=false$/m);
  assert.match(docs, /PUBLIC_ADSENSE_CONTENT_READY/);
  assert.match(docs, /manually reviewed original article inventory/i);
  assert.match(docs, /canonical detail article/i);
  assert.match(docs, /publication_integrity\.ok/);
  assert.match(docs, /nonzero/i);
  assert.match(docs, /cannot override.*zero.*invalid inventory/i);
});
