import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  auditPublicImages,
  discoverRenderedPublicImageFiles,
  publicDataSourceImageFailure,
  publicImageSurfaceFailures,
  renderedImageFailures,
} from '../scripts/audit-public-images.mjs';

const EXISTING_PUBLIC_IMAGE = '/generated/articles/27fe86b238ed616a-when-the-trump-administration-cracks-down-on-anthropic-who-benefits/thumbnail.webp';
const SOURCE_DERIVED_VARIANTS = {
  hero: { provider: 'source-image', status: 'source-canonical' },
  thumbnail: { provider: 'source-image', status: 'source-canonical' },
  og: { provider: 'source-image', status: 'source-canonical' },
};
const SOURCE_RIGHTS_AUDIT_NOW = new Date('2026-08-10T00:00:00Z');

export function registerPublicImageAuditContractTests() {
  test('public image audit checks rendered image tags without requiring visible source provenance labels', () => {
    const html = `<article><a data-image-provenance data-provenance-kind="image2"><img src="${EXISTING_PUBLIC_IMAGE}" alt="HPCwire editorial visual"></a></article>`;

    assert.deepEqual(renderedImageFailures('/fixture/', html), []);
    assert.doesNotMatch(html, /ChatGPT Image2 visual|Editorial visual|Original source image/);
  });

  test('public image audit rejects source-derived provenance in rendered output', () => {
    // Given: rendered public HTML that claims publisher-source image provenance.
    const html = `<article><a data-image-provenance data-provenance-kind="source"><img src="${EXISTING_PUBLIC_IMAGE}" alt="Publisher image"></a></article>`;

    // When: the built image surface is audited.
    const failures = renderedImageFailures('/fixture/', html);

    // Then: the source-derived output is release-blocking.
    assert.ok(failures.includes('/fixture/:unapproved_source_image_provenance'));
  });

  test('public image audit ignores source provenance selectors inside style text', () => {
    // Given: built HTML whose CSS mentions source provenance but whose rendered tags do not use it.
    const html = `<style>.article-image-provenance[data-provenance-kind="source"]{display:none}</style><article><img src="${EXISTING_PUBLIC_IMAGE}" alt="Editorial visual"></article>`;

    // When: the rendered image surface is audited.
    const failures = renderedImageFailures('/fixture/', html);

    // Then: stylesheet source text does not impersonate a rendered provenance attribute.
    assert.equal(failures.includes('/fixture/:unapproved_source_image_provenance'), false);
  });

  test('public image audit flags malformed rendered image surfaces', () => {
    const failures = renderedImageFailures('/fixture/', [
      '<img alt="No source">',
      '<img data-src="/generated/fallbacks/cloud-capacity.svg" data-alt="Lazy placeholder only">',
      '<img src="https://example.com/source.jpg" alt="Remote source">',
      '<img src="/generated/missing-public-image.webp" alt="">',
    ].join(''));

    assert.ok(failures.includes('/fixture/:img[0]:missing_src'));
    assert.ok(failures.includes('/fixture/:img[1]:missing_src'));
    assert.ok(failures.includes('/fixture/:img[2]:remote_image:https://example.com/source.jpg'));
    assert.ok(failures.includes('/fixture/:img[3]:missing_alt:/generated/missing-public-image.webp'));
    assert.ok(failures.includes('/fixture/:img[3]:missing_local_asset:/generated/missing-public-image.webp'));
  });

  test('public image audit discovers rendered public taxonomy and archive routes', () => {
    const distRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'compute-current-public-images-'));
    for (const file of [
      'index.html',
      'archive/index.html',
      'archive/2/index.html',
      'category/power-grid/index.html',
      'company/nvidia/index.html',
      'region/us/index.html',
      'admin.html/index.html',
      'admin/index.html',
      'dashboard/index.html',
    ]) {
      const full = path.join(distRoot, file);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, '<main></main>');
    }

    const paths = discoverRenderedPublicImageFiles(distRoot).map((entry) => entry.path).sort();

    assert.deepEqual(paths, [
      '/',
      '/archive/',
      '/archive/2/',
      '/category/power-grid/',
      '/company/nvidia/',
      '/region/us/',
    ]);
  });

  test('public image audit fails closed when rendered public HTML is missing', () => {
    const distRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'compute-current-public-images-empty-'));

    const result = auditPublicImages({ distRoot });

    assert.equal(result.ok, false);
    assert.equal(result.counts.renderedPages, 0);
    assert.ok(result.failures.includes('rendered-public-html:missing_all_public_html'));
    assert.ok(result.failures.includes('rendered-public-html:missing_expected_path:/'));
    assert.ok(result.failures.includes('rendered-public-html:missing_expected_path:/archive/'));
    assert.equal(
      result.failures.some((failure) => /^rendered-public-html:missing_longform_path:/.test(failure)),
      result.counts.longform > 0,
    );
  });

  test('public image surface audit validates public image fields without raw source-image false positives', () => {
    const failures = publicImageSurfaceFailures('fixture', [
      {
        id: 'source-url-safe',
        sourceImage: 'https://example.com/source-only.jpg',
        publicSignal: {
          image: '/generated/fallbacks/cloud-capacity.svg',
          image_alt: 'Cloud capacity editorial visual',
        },
      },
      {
        id: 'stock-derived',
        sourceImage: 'https://example.com/source-stock.jpg',
        publicSignal: {
          image: EXISTING_PUBLIC_IMAGE,
          image_alt: 'HPCwire editorial visual',
        },
      },
      {
        id: 'source-canonical',
        sourceImage: 'https://example.com/source-canonical.jpg',
        publicSignal: {
          image: EXISTING_PUBLIC_IMAGE,
          image_alt: 'HPCwire editorial visual',
          image_provider: 'source-image',
        },
      },
      {
        id: 'remote-public',
        publicSignal: {
          image: 'https://example.com/source.jpg',
          image_alt: 'Remote source',
        },
      },
    ]);

    assert.equal(failures.some((failure) => failure.includes('source-url-safe')), false);
    assert.ok(failures.includes(`fixture:stock-derived:stock_derived_public_image:${EXISTING_PUBLIC_IMAGE}`));
    assert.ok(failures.includes(`fixture:source-canonical:image_reuse_not_authorized:${EXISTING_PUBLIC_IMAGE}`));
    assert.ok(failures.includes('fixture:remote-public:remote_public_image:https://example.com/source.jpg'));
  });

  test('public data audit permits a currently authorized source-derived image variant', () => {
    // Given: a registered source with explicit, current image-reuse authorization.
    const article = { id: 'authorized-source-image', sourceUrl: 'https://authorized.example/story' };
    const sources = [{
      id: 'authorized-source',
      name: 'Authorized Source',
      domain: 'authorized.example',
      image_use_basis: 'licensed',
      terms_url: 'https://authorized.example/image-terms',
      reviewed_at: '2026-08-09T00:00:00Z',
      allow_image_reuse: true,
    }];

    // When: its selected source-derived variant is audited at a current review date.
    const failure = publicDataSourceImageFailure(article, SOURCE_DERIVED_VARIANTS, {
      sources,
      now: SOURCE_RIGHTS_AUDIT_NOW,
    });

    // Then: authorization prevents an unapproved-source failure.
    assert.equal(failure, '');
  });

  test('public data audit rejects explicitly disabled source image authorization', () => {
    // Given: a registered source whose current record explicitly denies image reuse.
    const article = { id: 'disabled-source-image', sourceUrl: 'https://disabled.example/story' };
    const sources = [{
      id: 'disabled-source',
      name: 'Disabled Source',
      domain: 'disabled.example',
      image_use_basis: 'licensed',
      terms_url: 'https://disabled.example/image-terms',
      reviewed_at: '2026-08-09T00:00:00Z',
      allow_image_reuse: false,
    }];

    // When: its selected source-derived variant is audited.
    const failure = publicDataSourceImageFailure(article, SOURCE_DERIVED_VARIANTS, {
      sources,
      now: SOURCE_RIGHTS_AUDIT_NOW,
    });

    // Then: the explicit denial remains release-blocking.
    assert.equal(failure, 'public-data:disabled-source-image:unapproved_source_image_surface');
  });

  test('public data audit rejects expired source image authorization', () => {
    // Given: a registered source whose otherwise valid authorization review has expired.
    const article = { id: 'expired-source-image', sourceUrl: 'https://expired.example/story' };
    const sources = [{
      id: 'expired-source',
      name: 'Expired Source',
      domain: 'expired.example',
      image_use_basis: 'licensed',
      terms_url: 'https://expired.example/image-terms',
      reviewed_at: '2024-01-01T00:00:00Z',
      allow_image_reuse: true,
    }];

    // When: its selected source-derived variant is audited.
    const failure = publicDataSourceImageFailure(article, SOURCE_DERIVED_VARIANTS, {
      sources,
      now: SOURCE_RIGHTS_AUDIT_NOW,
    });

    // Then: the stale review remains release-blocking.
    assert.equal(failure, 'public-data:expired-source-image:unapproved_source_image_surface');
  });

  test('public data audit rejects a source without a registry record', () => {
    // Given: a source-derived variant whose publisher has no registry record.
    const article = { id: 'missing-source-image', sourceUrl: 'https://missing.example/story' };

    // When: the selected variant is audited against an empty registry.
    const failure = publicDataSourceImageFailure(article, SOURCE_DERIVED_VARIANTS, {
      sources: [],
      now: SOURCE_RIGHTS_AUDIT_NOW,
    });

    // Then: missing authorization remains release-blocking.
    assert.equal(failure, 'public-data:missing-source-image:unapproved_source_image_surface');
  });

  test('public image audit rejects denied and orphaned legacy posters in the complete static tree', (t) => {
    const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'compute-current-static-image-audit-'));
    const publicRoot = path.join(fixtureRoot, 'public');
    const distRoot = path.join(fixtureRoot, 'dist');
    t.after(() => fs.rmSync(fixtureRoot, { recursive: true, force: true }));

    for (const root of [publicRoot, distRoot]) {
      fs.mkdirSync(path.join(root, 'generated', 'fallbacks'), { recursive: true });
      fs.writeFileSync(path.join(root, 'generated', 'denied-static-poster.jpg'), 'denied publisher poster');
      fs.writeFileSync(path.join(root, 'generated', 'orphan-static-poster.jpg'), 'orphan publisher poster');
      fs.writeFileSync(path.join(root, 'generated', 'safe-generated.webp'), 'safe generated image');
      fs.writeFileSync(path.join(root, 'generated', 'fallbacks', 'cloud-capacity.svg'), '<svg/>');
    }

    const result = auditPublicImages({
      publicRoot,
      distRoot,
      articles: [{ id: 'denied-static-poster', sourceUrl: 'https://denied.example/story' }],
      sources: [{
        id: 'denied-source',
        name: 'Denied Source',
        domain: 'denied.example',
        image_use_basis: 'none',
        terms_url: 'https://denied.example/terms',
        reviewed_at: '2026-08-11T00:00:00Z',
        allow_image_reuse: false,
      }],
      now: SOURCE_RIGHTS_AUDIT_NOW,
    });

    for (const rootLabel of ['public', 'dist']) {
      assert.ok(result.failures.includes(
        `static-image:${rootLabel}:/generated/denied-static-poster.jpg:image_reuse_not_authorized`,
      ));
      assert.ok(result.failures.includes(
        `static-image:${rootLabel}:/generated/orphan-static-poster.jpg:orphan_legacy_source_poster`,
      ));
      assert.equal(result.failures.some((failure) => failure.includes('safe-generated.webp')), false);
      assert.equal(result.failures.some((failure) => failure.includes('cloud-capacity.svg')), false);
    }
    assert.equal(result.counts.staticPublicImages, 4);
    assert.equal(result.counts.staticDistImages, 4);
  });

  test('public image audit preserves a currently authorized legacy source poster', (t) => {
    const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'compute-current-authorized-static-image-'));
    const publicRoot = path.join(fixtureRoot, 'public');
    const distRoot = path.join(fixtureRoot, 'dist');
    t.after(() => fs.rmSync(fixtureRoot, { recursive: true, force: true }));
    fs.mkdirSync(path.join(publicRoot, 'generated'), { recursive: true });
    fs.writeFileSync(path.join(publicRoot, 'generated', 'authorized-static-poster.jpg'), 'authorized poster');

    const result = auditPublicImages({
      publicRoot,
      distRoot,
      articles: [{ id: 'authorized-static-poster', sourceUrl: 'https://authorized.example/story' }],
      sources: [{
        id: 'authorized-source',
        name: 'Authorized Source',
        domain: 'authorized.example',
        image_use_basis: 'licensed',
        terms_url: 'https://authorized.example/terms',
        reviewed_at: '2026-08-09T00:00:00Z',
        allow_image_reuse: true,
      }],
      now: SOURCE_RIGHTS_AUDIT_NOW,
    });

    assert.equal(
      result.failures.some((failure) => failure.includes('authorized-static-poster.jpg')),
      false,
    );
    assert.equal(result.counts.staticPublicImages, 1);
  });

  test('aggregate public image audit uses one injected authorization clock across data surfaces', (t) => {
    const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'compute-current-audit-options-'));
    const publicRoot = path.join(fixtureRoot, 'public');
    const distRoot = path.join(fixtureRoot, 'dist');
    t.after(() => fs.rmSync(fixtureRoot, { recursive: true, force: true }));
    fs.mkdirSync(publicRoot, { recursive: true });
    fs.mkdirSync(distRoot, { recursive: true });

    const article = {
      id: 'aggregate-authorized-source',
      sourceUrl: 'https://authorized.example/story',
      generatedImage: EXISTING_PUBLIC_IMAGE,
      heroImage: EXISTING_PUBLIC_IMAGE,
      thumbnailImage: EXISTING_PUBLIC_IMAGE,
      ogImage: EXISTING_PUBLIC_IMAGE,
      generatedImageProvider: 'source-image',
      generatedImageModel: 'origin-canonical',
      imageStatus: 'source-canonical',
    };
    const sources = [{
      id: 'authorized-source',
      name: 'Authorized Source',
      domain: 'authorized.example',
      image_use_basis: 'licensed',
      terms_url: 'https://authorized.example/terms',
      reviewed_at: '2026-08-09T00:00:00Z',
      allow_image_reuse: true,
    }];

    const valid = auditPublicImages({
      publicRoot,
      distRoot,
      articles: [article],
      sources,
      now: SOURCE_RIGHTS_AUDIT_NOW,
    });
    const expired = auditPublicImages({
      publicRoot,
      distRoot,
      articles: [article],
      sources,
      now: new Date('2027-08-11T00:00:00Z'),
    });
    const validSurface = publicImageSurfaceFailures('fixture', [article], {
      sources,
      now: SOURCE_RIGHTS_AUDIT_NOW,
    });
    const expiredSurface = publicImageSurfaceFailures('fixture', [article], {
      sources,
      now: new Date('2027-08-11T00:00:00Z'),
    });

    assert.equal(
      valid.failures.includes('public-data:aggregate-authorized-source:unapproved_source_image_surface'),
      false,
    );
    assert.equal(
      expired.failures.includes('public-data:aggregate-authorized-source:unapproved_source_image_surface'),
      true,
    );
    assert.equal(validSurface.some((failure) => failure.includes('image_reuse_not_authorized')), false);
    assert.equal(expiredSurface.some((failure) => failure.includes('image_reuse_not_authorized')), true);
  });
}
