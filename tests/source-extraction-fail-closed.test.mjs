import test from 'node:test';
import assert from 'node:assert/strict';
import { sourceExtractionPassesLongformGate, sourceExtractionPassesPublicGate } from '../scripts/lib/source-extraction-fail-closed.mjs';
import { buildContentExtractionState } from '../scripts/lib/content.mjs';
import { validateExtractionArtifact } from '../scripts/lib/extraction-artifact.mjs';
import { currentSourceTextAuthorization } from '../scripts/lib/source-text-publication-authorization.mjs';
import { loadSourceRegistrySync } from '../scripts/lib/source-registry.mjs';

test('blocks boilerplate-only extracted source text', () => {
  const article = {
    articleText: 'Want more Data Center Knowledge stories? Sign up for newsletter. Copyright © 2026 TechTarget, Inc. Registered in England and Wales.',
  };
  const publicGate = sourceExtractionPassesPublicGate(article);
  assert.equal(publicGate.ok, false);
  assert.ok(publicGate.block_reasons.includes('copyright_footer_detected'));
});

test('allows local card but blocks longform when clean source evidence is short', () => {
  const clean = `${'NetApp and Red Hat described OpenShift backup, recovery, and storage operations for enterprise AI platform teams. '.repeat(7)}End users should validate restore timing.`;
  const publicGate = sourceExtractionPassesPublicGate({ articleText: clean });
  const longformGate = sourceExtractionPassesLongformGate({ articleText: clean });
  assert.equal(publicGate.ok, true);
  assert.equal(longformGate.ok, false);
});

test('creates a hash-verified exact extraction artifact before editorial generation', () => {
  const cleaned = `${'Utility records document transformer delivery and interconnection milestones for the campus. '.repeat(20)}Final source sentence complete.`;
  const result = sourceExtractionPassesLongformGate({
    sourceUrl: 'https://example.com/utility-record',
    articleText: cleaned,
  });

  assert.equal(result.ok, true);
  assert.equal(result.extraction_artifact.source_url, 'https://example.com/utility-record');
  assert.equal(result.extraction_artifact.cleaned_extracted_text, result.cleaned_source_text);
  assert.match(result.extraction_artifact.extracted_text_sha256, /^[a-f0-9]{64}$/);
  assert.equal(result.extraction_artifact.extraction_qa.can_generate_longform, true);
});

test('preserves a source extraction cap as a longform block while retaining the public card lane', () => {
  const cleaned = `${'Kubernetes node swap evidence records measured memory, density, and latency behavior for operators. '.repeat(35)}Final source sentence complete.`;
  const item = {
    title: 'Scaling Kubernetes Workloads with Node Swap',
    snippet: 'Measured node swap results.',
    url: 'https://kubernetes.io/blog/2026/10/05/scaling-kubernetes-workloads-with-node-swap/',
    sourceRegistryId: 'kubernetes-blog',
  };
  const extractionQa = {
    extraction_failure_reason: 'extracted_text_limit_exceeded',
    extraction_quality_score: 0.75,
    block_reasons: ['extracted_text_limit_exceeded'],
    can_generate_longform: false,
  };

  const state = buildContentExtractionState(item, cleaned, extractionQa);

  assert.equal(state.publicExtractionQa.public_publishable, true);
  assert.equal(state.publicExtractionQa.can_generate_longform, false);
  assert.deepEqual(state.publicExtractionQa.block_reasons, []);
  assert.deepEqual(state.publicExtractionQa.longform_block_reasons, ['extracted_text_limit_exceeded']);
  assert.equal(state.extractionArtifact.extraction_qa.public_publishable, true);
  assert.equal(state.extractionArtifact.extraction_qa.can_generate_longform, false);
  assert.deepEqual(state.extractionArtifact.extraction_qa.block_reasons, []);
  assert.deepEqual(state.extractionArtifact.extraction_qa.longform_block_reasons, ['extracted_text_limit_exceeded']);
  assert.equal(validateExtractionArtifact(state.extractionArtifact).ok, true);

  const persisted = JSON.parse(JSON.stringify({
    ...item,
    articleText: cleaned,
    extraction_qa: state.publicExtractionQa,
    extraction_artifact: state.extractionArtifact,
  }));
  const publicGate = sourceExtractionPassesPublicGate(persisted);
  const longformGate = sourceExtractionPassesLongformGate(persisted);
  assert.equal(publicGate.ok, true);
  assert.deepEqual(publicGate.block_reasons, []);
  assert.equal(longformGate.ok, false);
  assert.ok(longformGate.block_reasons.includes('extracted_text_limit_exceeded'));

  const artifactOnly = { ...persisted };
  delete artifactOnly.extraction_qa;
  const artifactOnlyLongform = sourceExtractionPassesLongformGate(artifactOnly);
  assert.equal(artifactOnlyLongform.ok, false);
  assert.ok(artifactOnlyLongform.block_reasons.includes('extracted_text_limit_exceeded'));

  const sourceAuthorization = currentSourceTextAuthorization(
    persisted,
    state.extractionArtifact,
    { sourceRegistry: loadSourceRegistrySync(), now: new Date('2026-10-07T00:00:00.000Z') },
  );
  assert.equal(sourceAuthorization.ok, true);
});
