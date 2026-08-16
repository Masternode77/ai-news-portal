import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { runPublishCycle } from '../scripts/lib/publish-cycle.mjs';
import { finalPublicationIntegrityResult } from '../scripts/lib/final-publication-integrity.mjs';
import { createExtractionArtifact } from '../scripts/lib/extraction-artifact.mjs';
import { writeJsonFile } from '../scripts/lib/state-store.mjs';
import {
  authorizedAdminSourceRegistry,
} from './fixtures/admin-publication-integrity.mjs';

const adversarialBody = [
  'The utility schedule is presented as the controlling constraint for a planned compute campus, and the analysis treats energization timing as the first decision point for operators.',
  'Capacity buyers would benefit if the delivery calendar becomes firm enough to align rack deployment with contracted service windows, while developers remain exposed to schedule movement.',
  'The commercial question is whether procurement teams can reserve equipment against a verified opening date without absorbing delay risk from upstream infrastructure dependencies.',
  'Investors should watch the handoff between utility milestones and construction commitments because that boundary determines when announced demand can become usable capacity.',
  'Operators also need evidence that substation work, equipment delivery, and commissioning plans move together before they revise deployment assumptions or supplier allocations.',
  'The skeptical case is that the announcement describes intent without changing the practical availability of power, space, cooling, or network capacity for customers.',
  'Teams that underwrite the schedule too early carry the exposure if customer commitments or delivery milestones remain conditional rather than contractually fixed.',
  'The next observable signal is a source-backed delivery milestone that changes the operating calendar instead of repeating a broad market-demand narrative.',
].join('\n\n');

test('scheduled publish cycle fails closed when route flags try to bypass failed source extraction', async () => {
  // Given: a router marks a long body public even though the source extraction is unusable.
  const source = {
    id: 'failed-extraction-bypass',
    title: 'Utility schedule controls campus timing',
    source: 'Example Dispatch',
    sourceUrl: 'https://example.com/failed-extraction-bypass',
    publishedAt: '2026-08-09T00:00:00.000Z',
    articleText: 'Too short.',
    infrastructure_relevance_score: 0.91,
  };

  // When: the alternate scheduled publishing path receives permissive routing flags.
  const result = await runPublishCycle({
    articles: [source],
    routeArticle: async () => ({
      id: source.id,
      title: source.title,
      tier: 'longform_analysis',
      coreFeedEligible: true,
      detailPage: true,
      finalArticleBody: adversarialBody,
      brief: 'A utility schedule may change the operating calendar for a planned compute campus.',
      reasons: [],
      relevance: { score: 0.91, visibility: 'core', laneKey: 'power-grid' },
    }),
    now: '2026-08-09T01:00:00.000Z',
  });

  // Then: no local detail article is emitted into any public publication artifact.
  assert.equal(result.summary.published, 0);
  assert.equal(result.artifacts.latestNews.some((article) => article.id === source.id), false);
  assert.equal(result.artifacts.searchIndex.some((article) => article.id === source.id), false);
  assert.equal(result.artifacts.sitemapEntries.some((entry) => entry.loc === `/news/${source.id}/`), false);
});

test('canonical public artifact persistence quarantines a final body that bypasses the scheduled router', async () => {
  // Given: another scheduled CLI writes a falsely published final body directly to a canonical artifact name.
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'compute-current-publication-integrity-'));
  const artifactPath = path.join(directory, 'latest-news.json');
  const article = {
    id: 'direct-write-bypass',
    title: 'Direct write bypass',
    public_status: 'published',
    articlePagePublished: true,
    homepagePublished: true,
    articleText: 'Too short.',
    expertLensFull: { finalArticleBody: adversarialBody },
  };

  // When: the shared persistence adapter writes the public collection.
  await writeJsonFile(artifactPath, [article]);
  const [persisted] = JSON.parse(await fs.readFile(artifactPath, 'utf8'));

  // Then: the persisted record is fail-closed rather than publicly addressable.
  assert.equal(persisted.public_status, 'quarantined');
  assert.equal(persisted.articlePagePublished, false);
  assert.equal(persisted.homepagePublished, false);
  assert.equal(persisted.archiveOnly, true);
});

test('canonical public artifact persistence quarantines an explicitly public record without a final body', async () => {
  // Given: a scheduled candidate retains public flags after longform generation is skipped.
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'compute-current-bodyless-publication-'));
  const artifactPath = path.join(directory, 'latest-news.json');
  const article = {
    id: 'bodyless-scheduled-candidate',
    title: 'Bodyless scheduled candidate',
    public_status: 'published',
    articlePagePublished: true,
    homepagePublished: true,
  };

  // When: the shared persistence adapter writes the public collection.
  await writeJsonFile(artifactPath, [article]);
  const [persisted] = JSON.parse(await fs.readFile(artifactPath, 'utf8'));

  // Then: the contradictory public state is quarantined before downstream audits run.
  assert.equal(persisted.public_status, 'quarantined');
  assert.equal(persisted.articlePagePublished, false);
  assert.equal(persisted.homepagePublished, false);
  assert.equal(persisted.archiveOnly, true);
});

test('final publication boundary rejects generated text masquerading as extracted source evidence', () => {
  // Given: generated article text and rawText are populated, but no immutable extraction artifact exists.
  const generated = {
    id: 'generated-evidence-contamination',
    title: 'Generated evidence contamination',
    sourceUrl: 'https://example.com/generated-evidence-contamination',
    public_status: 'published',
    articlePagePublished: true,
    infrastructure_relevance_score: 0.91,
    rawText: adversarialBody.repeat(3),
    articleText: adversarialBody.repeat(3),
    source_evidence_text: adversarialBody.repeat(3),
    claim_ledger: [],
    public_routing: { visibility: 'core', score: 0.91, laneKey: 'power-grid' },
    expertLensFull: { finalArticleBody: adversarialBody.repeat(6) },
  };

  // When: the final publication boundary evaluates the record.
  const result = finalPublicationIntegrityResult(generated);

  // Then: generated fields cannot substitute for immutable extracted evidence.
  assert.equal(result.ok, false);
  assert.ok(result.reasons.includes('extraction_artifact:missing_or_invalid'));
});

test('legacy published final bodies without an explicit detail flag remain quarantinable', () => {
  const result = finalPublicationIntegrityResult({
    id: 'legacy-public-body',
    public_status: 'published',
    expertLensFull: { finalArticleBody: adversarialBody },
  });

  assert.equal(result.ok, false);
  assert.equal(result.skipped, false);
  assert.ok(result.reasons.includes('extraction_artifact:missing_or_invalid'));
});

test('final publication boundary reports every mandatory body-quality gate', () => {
  // Given: public candidates crafted to violate distinct mandatory checks.
  const sourceEvidence = Array.from({ length: 16 }, (_, index) => (
    `Source evidence sentence ${String.fromCharCode(65 + index)} describes utility interconnection schedules, transformer delivery, customer commitments, and campus commissioning dependencies in complete detail.`
  )).join(' ');
  const base = {
    id: 'gate-base',
    title: 'Utility milestones shape campus commissioning',
    public_status: 'published',
    articlePagePublished: true,
    infrastructure_relevance_score: 0.91,
    sourceRegistryId: 'authorized-test-source',
    sourceUrl: 'https://example.com/gate-source',
    source_evidence_text: sourceEvidence,
    articleText: sourceEvidence,
    extraction_artifact: createExtractionArtifact({
      sourceUrl: 'https://example.com/gate-source',
      cleanedExtractedText: sourceEvidence,
      extractionQa: { public_publishable: true, can_generate_longform: true, sentence_completion_score: 1 },
    }),
    claim_ledger: [],
    public_routing: { visibility: 'core', score: 0.91, laneKey: 'power-grid' },
    expertLensFull: { finalArticleBody: adversarialBody },
  };

  // When: each candidate crosses the final publication boundary.
  const detail = finalPublicationIntegrityResult({
    ...base,
    expertLensFull: { finalArticleBody: 'One thin sentence cannot support a public article detail page.' },
  });
  const extractionQa = finalPublicationIntegrityResult({
    ...base,
    extraction_artifact: createExtractionArtifact({
      sourceUrl: 'https://example.com/gate-source',
      cleanedExtractedText: sourceEvidence,
      extractionQa: { public_publishable: false, can_generate_longform: false, sentence_completion_score: 1 },
    }),
  });
  const fidelity = finalPublicationIntegrityResult({
    ...base,
    expertLensFull: { finalArticleBody: `${adversarialBody}\n\nAn orbital refinery guarantees interplanetary fuel exports and lunar commodity clearing for sovereign buyers.` },
  });
  const unsupported = finalPublicationIntegrityResult({
    ...base,
    expertLensFull: { finalArticleBody: `${adversarialBody}\n\nThe campus will receive 999 MW of capacity.` },
  });
  const repetition = finalPublicationIntegrityResult(base, [{
    ...base,
    id: 'recent-article',
    publishedAt: '2026-08-08T00:00:00.000Z',
  }]);
  const copied = finalPublicationIntegrityResult({
    ...base,
    source_evidence_text: adversarialBody,
    articleText: adversarialBody,
    extraction_artifact: createExtractionArtifact({
      sourceUrl: 'https://example.com/gate-source',
      cleanedExtractedText: adversarialBody,
      extractionQa: { public_publishable: true, can_generate_longform: true, sentence_completion_score: 1 },
    }),
  });
  const validBody = [
    'Utility interconnection schedules create a controlling constraint for campus commissioning, so operators need verified transformer delivery before changing deployment plans.',
    'Capacity buyers benefit when customer commitments align with energization timing, while developers remain exposed when infrastructure dependencies move the construction calendar.',
    'Procurement teams should reserve equipment only after utility milestones and service agreements support a credible opening window for the planned compute campus.',
    'Investors should watch substation construction and transformer delivery because those milestones determine when committed demand can become usable infrastructure capacity.',
    'Operators need commissioning evidence across power equipment, cooling readiness, and network delivery before changing supplier allocation or rack deployment assumptions.',
    'The skeptical case is that customer commitments describe demand without proving practical availability of power capacity for the campus operating schedule.',
    'Developers carry schedule exposure when utility agreements, transformer delivery, or commissioning milestones remain conditional instead of contractually fixed.',
    'The next decision point is a verified interconnection milestone that changes the campus operating calendar and supports customer capacity commitments.',
  ].join('\n\n');
  const longValidBody = Array.from({ length: 5 }, (_, index) => [
    `Decision Evidence ${index + 1}`,
    validBody,
  ].join('\n\n')).join('\n\n');
  const validSource = Array.from({ length: 16 }, (_, index) => (
    `Utility evidence ${String.fromCharCode(65 + index)} documents interconnection schedules, transformer delivery, customer commitments, substation construction, campus commissioning, cooling readiness, network delivery, procurement plans, capacity availability, capacity buyers, developer exposure, operating milestones, service agreements, credible opening windows, compute campus plans, supplier allocation, rack deployment, energization timing, infrastructure dependencies, construction calendars, buyer benefits, and schedule alignment.`
  )).join(' ');
  const valid = finalPublicationIntegrityResult({
    ...base,
    id: 'valid-control',
    source_evidence_text: validSource,
    articleText: validSource,
    extraction_artifact: createExtractionArtifact({
      sourceUrl: 'https://example.com/gate-source',
      cleanedExtractedText: validSource,
      extractionQa: { public_publishable: true, can_generate_longform: true, sentence_completion_score: 1 },
    }),
    expertLensFull: { finalArticleBody: longValidBody },
  }, [], {
    sourceRegistry: authorizedAdminSourceRegistry(),
    now: '2026-08-10T00:00:00.000Z',
  });

  // Then: extraction QA, article detail, fidelity, unsupported claims, repetition, and copyright each block publication.
  assert.ok(detail.reasons.some((reason) => reason.startsWith('article_detail:')));
  assert.ok(extractionQa.reasons.some((reason) => reason.startsWith('extraction_qa:')));
  assert.ok(fidelity.reasons.some((reason) => reason.startsWith('source_fidelity:')));
  assert.ok(unsupported.reasons.some((reason) => reason.startsWith('unsupported_claim:')));
  assert.ok(repetition.reasons.some((reason) => reason.startsWith('repetition:')));
  assert.ok(copied.reasons.some((reason) => reason.startsWith('copyright:')));
  assert.equal(valid.ok, true, JSON.stringify({ reasons: valid.reasons, unsupported: valid.checks.fidelity.unsupportedClaims }));
  assert.deepEqual(valid.reasons, []);
});
