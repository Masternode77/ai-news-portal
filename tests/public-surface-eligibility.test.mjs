import assert from 'node:assert/strict';
import test from 'node:test';
import { isPublicLongformArticle } from '../scripts/lib/public-surface-eligibility.mjs';
import {
  authorizedAdminSourceRegistry,
  canonicalAdminArticle,
} from './fixtures/admin-publication-integrity.mjs';

test('legacy records without explicit detail publication are not public longform', () => {
  assert.equal(isPublicLongformArticle({ id: 'legacy-record', public_status: 'published' }), false);
});

test('source-link briefs never acquire a local detail route', () => {
  assert.equal(isPublicLongformArticle({
    id: 'source-brief',
    articlePagePublished: true,
    public_status: 'published',
    public_content_tier: 'editorial_brief',
  }), false);
});

test('already-published detail is removed when current source text authorization is revoked', () => {
  // Given: a structurally valid published article whose source authorization is now disabled.
  const article = canonicalAdminArticle({ published: true });
  const sourceRegistry = authorizedAdminSourceRegistry({ allow_text_use: false });

  // When: the build/public predicate reevaluates the current registry.
  const eligible = isPublicLongformArticle(article, {
    sourceRegistry,
    now: '2026-08-10T00:00:00.000Z',
  });
  const authorized = isPublicLongformArticle(article, {
    sourceRegistry: authorizedAdminSourceRegistry(),
    now: '2026-08-10T00:00:00.000Z',
  });

  // Then: stale publication state cannot keep a detail route public.
  assert.equal(authorized, true);
  assert.equal(eligible, false);
});
