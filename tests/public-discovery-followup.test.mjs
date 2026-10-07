import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

test('empty company pages fail closed for indexing only when both public lanes are empty', () => {
  const page = fs.readFileSync('src/pages/company/[slug].astro', 'utf8');
  assert.match(page, /feed\.items\.length === 0 && companyHeadlines\.length === 0/);
  assert.match(page, /noindex=\{noindex\}/);
});

test('homepage long-form status uses the unified catalog including columns', () => {
  const page = fs.readFileSync('src/pages/index.astro', 'utf8');
  assert.match(page, /publicationCatalog\s*\n\s*\.filter\(\(item\) => item\.type === 'Analysis' \|\| item\.type === 'Column'\)/);
  assert.match(page, /Math\.max\([\s\S]*freshnessLongFormStampMs[\s\S]*currentLongFormStampMs/);
});

test('column source attribution passes authors through the CC BY renderer', () => {
  const detail = fs.readFileSync('src/pages/column/[slug].astro', 'utf8');
  const license = fs.readFileSync('src/components/SourceLicense.astro', 'utf8');
  assert.match(detail, /<SourceLicense url=\{source\.url\} author=\{source\.author\}/);
  assert.match(license, /epochAttribution/);
  assert.match(license, /for Epoch AI/);
});

test('Malaysia legacy slug permanently redirects to the neutral canonical slug', () => {
  const config = fs.readFileSync('astro.config.mjs', 'utf8');
  assert.match(config, /malaysia-collapsed-a-multi-billion-dollar-server-smuggling-route-2026-10-04/);
  assert.match(config, /status:\s*301/);
  assert.match(config, /malaysia-server-trade-gap-permit-enforcement-2026-10-04/);
  // Astro's static output is a meta refresh; the deployment must also send a
  // permanent HTTP redirect for clients and crawlers that do not render it.
  const deployment = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));
  const legacy = '/column/malaysia-collapsed-a-multi-billion-dollar-server-smuggling-route-2026-10-04';
  for (const source of [legacy, `${legacy}/`]) {
    assert.deepEqual(deployment.redirects.find((entry) => entry.source === source), {
      source,
      destination: '/column/malaysia-server-trade-gap-permit-enforcement-2026-10-04/',
      permanent: true,
    });
  }
});
