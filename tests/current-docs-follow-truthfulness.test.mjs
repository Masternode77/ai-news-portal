import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';
import { buildOmoUltraAudit } from '../scripts/audit-omo-ultra-current-state.mjs';

const readRepositoryText = (relativePath) => fs.readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');

test('Given implemented publication and admin controls When generating the current-state audit Then it records those controls and only the external production rate-limit dependency', async () => {
  const audit = await buildOmoUltraAudit();

  assert.match(audit.markdown, /finalPublicationIntegrityResult/);
  assert.match(audit.markdown, /source rights.*extraction.*detail.*fidelity.*unsupported.*repetition.*copyright/i);
  assert.match(audit.markdown, /structured scrypt.*timing-safe/i);
  assert.match(audit.markdown, /HttpOnly.*SameSite=Strict.*CSRF/i);
  assert.match(audit.markdown, /local failed-login throttling.*audit logging/i);
  assert.match(audit.markdown, /distributed Vercel Firewall rate-limit rule.*ADMIN_VERCEL_RATE_LIMIT_READY/i);
  assert.doesNotMatch(audit.markdown, /must be replaced with hash verification, CSRF protection, rate limiting\/logging, and stronger session secret naming/i);
  assert.doesNotMatch(audit.markdown, /not one audited end-to-end public contract/i);
});

test('Given the production surface verifier When reading the commercialization checklist Then it requires the same sitemap inclusion and exclusion contract', async () => {
  const checklist = await readRepositoryText('docs/commercialization-deploy-checklist.md');

  assert.match(checklist, /\/sitemap\.xml.*\/contact\/.*excludes.*\/subscribe\/.*\/pricing\/.*\/sample\/.*\/briefing\//i);
  assert.match(checklist, /Astro child sitemap.*\/contact\/.*excludes.*\/subscribe\/.*\/pricing\/.*\/sample\/.*\/briefing\//i);
  assert.doesNotMatch(checklist, /(?:\/sitemap\.xml|Astro child sitemap) includes the five commercial routes/i);
});

test('Given zero currently authorized text sources When reading the Follow page Then it offers RSS and archive access without a fixed publication cadence', async () => {
  const follow = await readRepositoryText('src/pages/follow.astro');

  assert.match(follow, /source-linked/i);
  assert.match(follow, /rights.*editorial.*publication checks/i);
  assert.match(follow, /pipeline pauses instead of publishing/i);
  assert.match(follow, /feed reader/i);
  assert.match(follow, /publication archive/i);
  assert.doesNotMatch(follow, /every new Compute Current analysis|Never miss a new analysis|several times a day/i);
});
