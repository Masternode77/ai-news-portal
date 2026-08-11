import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const readSource = (relativePath) => fs.readFileSync(path.resolve(relativePath), 'utf8');

const adSlot = readSource('src/components/monetize/AdSlot.astro');
const footer = readSource('src/components/SiteFooter.astro');
const styles = readSource('src/styles/terminal.css');
const advertisingPolicy = readSource('src/pages/advertising-policy.astro');

test('ad slots use the permitted disclosure label and reserve variant space at every breakpoint', () => {
  assert.match(adSlot, /<span class="ad-slot-label">Advertisements<\/span>/);
  assert.doesNotMatch(adSlot, />Advertisement</);

  for (const variant of ['leaderboard', 'infeed', 'article', 'box']) {
    assert.match(styles, new RegExp(`\\.ad-slot-${variant} \\.adsbygoogle\\s*\\{[^}]*min-height: \\d+px;`));
  }

  const mobileStyles = styles.match(/@media \(max-width: 640px\) \{([\s\S]*?)\n\}/)?.[1] || '';
  for (const variant of ['leaderboard', 'infeed', 'article', 'box']) {
    assert.match(mobileStyles, new RegExp(`\\.ad-slot-${variant} \\.adsbygoogle\\s*\\{[^}]*min-height: \\d+px;`));
  }

  const adAndConsentStyles = styles.slice(styles.indexOf('/* Ad slots'), styles.indexOf('/* Responsive'));
  assert.doesNotMatch(adAndConsentStyles, /overflow:\s*hidden/i);
});

test('house promotions remain semantic and keyboard accessible', () => {
  assert.match(adSlot, /<aside[^>]+class:list=\{\['ad-slot', 'house-promo'/);
  assert.match(adSlot, /aria-label="Compute Current promotion"/);
  assert.match(adSlot, /<a class="house-promo-cta" href=\{house\.href\}>\{house\.cta\}<\/a>/);
  assert.match(styles, /\.house-promo-cta:focus-visible\s*\{/);
});

test('footer exposes advertising policy and a guarded GDPR privacy-choices control outside privacy', () => {
  assert.match(footer, /\['Advertising policy', '\/advertising-policy\/'\]/);
  assert.match(footer, /const showPrivacyChoices = Astro\.url\.pathname\.replace\(/);
  assert.match(footer, /!== '\/privacy';/);
  assert.match(footer, /id="cc-privacy-choices"/);
  assert.match(footer, />\s*Privacy choices\s*</);
  assert.match(footer, /var googleFc = window\.googlefc;/);
  assert.match(footer, /if \(!googleFc \|\| !googleFc\.callbackQueue \|\| typeof googleFc\.callbackQueue\.push !== 'function' \|\| typeof googleFc\.showRevocationMessage !== 'function'\) return;/);
  assert.match(footer, /callbackQueue/);
  assert.match(footer, /CONSENT_API_READY/);
  assert.match(footer, /typeof window\.__tcfapi/);
  assert.match(footer, /__tcfapi\('getTCData', 2,/);
  assert.match(footer, /tcData\.gdprApplies === true/);
  assert.match(footer, /showRevocationMessage/);
  assert.match(styles, /\.privacy-choices-control\s*\{/);
  assert.match(styles, /\.privacy-choices-control:focus-visible\s*\{/);
});

test('advertising policy makes commercial and editorial boundaries explicit', () => {
  for (const requirement of [
    /Advertisements/i,
    /separate from editorial/i,
    /Sponsorship/i,
    /Affiliate/i,
    /rel="sponsored"/i,
    /editorial control/i,
    /invalid click/i,
    /contact/i,
  ]) {
    assert.match(advertisingPolicy, requirement);
  }
});
