import { authoredColumnQualityResult } from './authored-column-policy.mjs';
import { buildClaimLedger } from './claim-ledger.mjs';
import { currentSourceTextAuthorization } from './source-text-publication-authorization.mjs';
import { sourceExtractionPassesLongformGate } from './source-extraction-fail-closed.mjs';

// Image-only maintenance must not spend generation work on an unverifiable
// column. These checks do not rewrite, unpublish, or mark its artwork complete.
export function columnArtworkReadiness(column, sourceRecords = [], columns = [], options = {}) {
  const reasons = [];
  const ids = column.based_on_article_ids || [];
  if (!ids.length) return { ok: false, reasons: ['source_records_missing'] };
  const sources = ids.map(id => sourceRecords.find(record => record.id === id));
  const verified = [];
  for (let index = 0; index < sources.length; index += 1) {
    const source = sources[index];
    if (!source) {
      reasons.push(`source_missing:${ids[index]}`);
      continue;
    }
    const artifact = source.extraction_artifact;
    const rights = currentSourceTextAuthorization(source, artifact, options);
    if (!rights.ok) reasons.push(`source_authorization:${source.id}:${rights.detail}`);
    const qa = artifact?.extraction_qa;
    const text = artifact?.cleaned_extracted_text || '';
    const extraction = sourceExtractionPassesLongformGate({ ...source, rawText: text });
    if (!text || qa?.can_generate_longform !== true || !extraction.ok
      || source.extraction_qa?.can_generate_longform === false
      || source.extraction_qa?.public_publishable === false
      || source.extraction_qa?.extraction_failure_reason
      || source.extraction_qa?.block_reasons?.length) {
      reasons.push(`source_extraction:${source.id}`);
    }
    verified.push({
      title: source.title, source_name: source.source,
      source_url: source.sourceUrl || source.url, cleaned_text: text,
    });
  }
  const linked = new Set(verified.map(source => source.source_url));
  const attributed = new Set((column.sources || []).map(source => source.url));
  if (!attributed.size || attributed.size !== linked.size || [...attributed].some(url => !linked.has(url))) {
    reasons.push('source_links_do_not_match_evidence');
  }
  if (reasons.length) return { ok: false, reasons };

  const [representative_source, ...supporting_sources] = verified;
  const ledger = buildClaimLedger({ cluster_id: column.story_key, representative_source, supporting_sources }, column.id);
  const body = column.expertLensFull?.finalArticleBody || '';
  const facts = ledger.claims.filter(claim => claim.verification_status === 'verified_primary').map(claim => claim.claim_text);
  if (!facts.length) reasons.push('source_fidelity:no_verified_source_claims');
  // Reuse the authored contract for numeric provenance, overlap and repetition.
  // Lexical coverage of all source sentences is not an opinion-fidelity test;
  // substantive assertions still require the operator's source review.
  const quality = authoredColumnQualityResult({
    body, title: column.title, deck: column.deck, summary: column.summary,
    thesis: column.stance?.thesis, figures: column.figures,
    ledgerClaims: ledger.claims, sourceText: verified.map(source => source.cleaned_text).join('\n'),
    recentRecords: columns.filter(other => other.id !== column.id),
  });
  reasons.push(...quality.reasons.map(reason => `authored_quality:${reason}`));
  return { ok: reasons.length === 0, reasons, metrics: quality.metrics };
}
