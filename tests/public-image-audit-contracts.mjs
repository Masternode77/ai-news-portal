import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  auditPublicImages,
  discoverRenderedPublicImageFiles,
  publicImageSurfaceFailures,
  renderedImageFailures,
} from '../scripts/audit-public-images.mjs';

const EXISTING_PUBLIC_IMAGE = '/generated/articles/d88b475419d77865-discover-the-unified-supercomputing-solution-for-converged-hpc-and-ai/thumbnail.webp';

export function registerPublicImageAuditContractTests() {
  test('public image audit checks rendered image tags without requiring visible source provenance labels', () => {
    const html = `<article><a data-image-provenance data-provenance-kind="source"><img src="${EXISTING_PUBLIC_IMAGE}" alt="HPCwire editorial visual"></a></article>`;

    assert.deepEqual(renderedImageFailures('/fixture/', html), []);
    assert.doesNotMatch(html, /ChatGPT Image2 visual|Editorial visual|Original source image/);
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
    assert.ok(result.failures.some((failure) => /^rendered-public-html:missing_longform_path:/.test(failure)));
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
    assert.equal(failures.some((failure) => failure.includes('source-canonical')), false);
    assert.ok(failures.includes('fixture:remote-public:remote_public_image:https://example.com/source.jpg'));
  });
}
