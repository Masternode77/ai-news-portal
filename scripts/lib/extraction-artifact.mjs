import { createHash } from 'node:crypto';
import { safeHttpUrl } from './normalize.mjs';

export const MIN_PUBLIC_EXTRACTION_CHARS = 500;

function normalizedText(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

export function extractedTextSha256(text = '') {
  return createHash('sha256').update(String(text), 'utf8').digest('hex');
}

export function createExtractionArtifact({ sourceUrl = '', cleanedExtractedText = '', extractionQa = {} } = {}) {
  const text = normalizedText(cleanedExtractedText);
  const qa = Object.freeze({
    cleaned_source_length: text.length,
    block_reasons: [],
    ...extractionQa,
  });
  return Object.freeze({
    artifact_version: 'extraction_v1',
    source_url: safeHttpUrl(sourceUrl),
    extracted_text_sha256: extractedTextSha256(text),
    cleaned_extracted_text: text,
    extraction_qa: qa,
  });
}

export function validateExtractionArtifact(artifact = {}) {
  const rawText = typeof artifact?.cleaned_extracted_text === 'string' ? artifact.cleaned_extracted_text : '';
  const text = normalizedText(rawText);
  const sourceUrl = safeHttpUrl(artifact?.source_url);
  const qa = artifact?.extraction_qa;
  const reasons = [];
  if (artifact?.artifact_version !== 'extraction_v1') reasons.push('unsupported_version');
  if (!sourceUrl || sourceUrl !== artifact?.source_url) reasons.push('missing_or_noncanonical_source_url');
  if (!text) reasons.push('missing_cleaned_extracted_text');
  if (rawText !== text) reasons.push('cleaned_extracted_text_not_normalized');
  if (text.length < MIN_PUBLIC_EXTRACTION_CHARS) reasons.push(`cleaned_extracted_text_below_${MIN_PUBLIC_EXTRACTION_CHARS}`);
  if (!/^[a-f0-9]{64}$/i.test(String(artifact?.extracted_text_sha256 || ''))
    || artifact.extracted_text_sha256 !== extractedTextSha256(text)) {
    reasons.push('extracted_text_hash_mismatch');
  }
  if (!qa || typeof qa !== 'object' || Array.isArray(qa)) {
    reasons.push('missing_extraction_qa');
  } else {
    if (qa.public_publishable !== true) reasons.push('extraction_qa_public_publishable_not_true');
    if (qa.cleaned_source_length !== text.length) reasons.push('extraction_qa_length_mismatch');
    if (!Array.isArray(qa.block_reasons) || qa.block_reasons.length !== 0) reasons.push('extraction_qa_block_reasons_present_or_missing');
    if (!Number.isFinite(Number(qa.sentence_completion_score)) || Number(qa.sentence_completion_score) < 0.92) {
      reasons.push('extraction_qa_sentence_completion_below_0.92');
    }
  }
  return { ok: reasons.length === 0, reasons, text, sourceUrl };
}
