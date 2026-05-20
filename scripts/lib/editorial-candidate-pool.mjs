import { analyzeSourceExtractionFailClosed } from './source-extraction-fail-closed.mjs';
import { sourceScopePolicyResult } from './source-scope-policy.mjs';

function compact(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function publishedTime(article = {}) {
  return new Date(article.publishedAt || article.analysisPublishedAt || article.updatedAt || 0).getTime();
}

function titleKey(article = {}) {
  return compact(article.title || '')
    .toLowerCase()
    .replace(/^([^:]{2,38}):\s+\1:\s+/i, '$1: ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .slice(0, 14)
    .join(' ');
}

function relevant(article = {}) {
  const score = Number(article.infrastructure_relevance_score || 0);
  const text = compact(`${article.title || ''} ${article.summary || ''} ${article.snippet || ''} ${article.cleaned_source_text || ''}`);
  return score >= 0.58
    || /\b(data centers?|datacenters?|gpu|accelerator|cloud region|power|grid|utility|cooling|semiconductor|memory|server|storage|hyperscale|colocation|AI infrastructure)\b/i.test(text);
}

function dirtyReason(article = {}, extraction = analyzeSourceExtractionFailClosed(article)) {
  const text = JSON.stringify(article);
  if (/boilerplate_leakage|copyright_footer|truncation|ellipsis|source_boilerplate_only/i.test(text)) return 'dirty_extraction_or_boilerplate';
  if (!relevant(article)) return 'low_infrastructure_relevance';
  if (!extraction.can_publish_local_article) return `source_extraction:${extraction.reasons[0] || 'failed'}`;
  return '';
}

function rescueEligible(article = {}, extraction = analyzeSourceExtractionFailClosed(article)) {
  if (!relevant(article)) return false;
  if (!extraction.can_publish_local_article) return false;
  const reasons = [
    ...(Array.isArray(article.public_publish_block_reasons) ? article.public_publish_block_reasons : []),
    ...(Array.isArray(article.regeneration_notes) ? article.regeneration_notes : []),
    ...(Array.isArray(article.seo_noindex_reasons) ? article.seo_noindex_reasons : []),
  ].join(' ');
  if (/boilerplate|copyright|truncation|footer|low_infrastructure_relevance|consumer|generic AI/i.test(reasons)) return false;
  return true;
}

export function buildEditorialCandidatePool(items = [], options = {}) {
  const days = Number(options.days || 45);
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const seenTitles = new Set();
  const candidates = [];
  const rejected = [];

  for (const article of items.filter(Boolean).sort((a, b) => publishedTime(b) - publishedTime(a))) {
    if (publishedTime(article) < cutoff) continue;
    const key = titleKey(article);
    if (!key || seenTitles.has(key)) continue;
    seenTitles.add(key);
    const extraction = analyzeSourceExtractionFailClosed(article);
    const policy = sourceScopePolicyResult(article);
    if (!rescueEligible(article, extraction)) {
      rejected.push({ article, reason: dirtyReason(article, extraction) || 'not_rescue_eligible' });
      continue;
    }
    const score = Number(article.infrastructure_relevance_score || 0);
    const candidateScore = score
      + (extraction.can_generate_longform ? 0.12 : 0)
      + (policy.has_explicit_capacity_evidence ? 0.08 : 0)
      + (article.public_status === 'quarantined' ? 0.03 : 0);
    candidates.push({
      article,
      extraction,
      policy,
      candidate_score: Number(candidateScore.toFixed(3)),
      rescue_reason: article.public_status === 'quarantined' ? 'solvable_quarantine_with_v3_rewrite' : 'clean_recent_candidate',
    });
  }

  candidates.sort((a, b) => b.candidate_score - a.candidate_score || publishedTime(b.article) - publishedTime(a.article));
  return { candidates, rejected, scanned: items.length, cutoff: new Date(cutoff).toISOString() };
}
