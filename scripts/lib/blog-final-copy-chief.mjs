import { editAnalystStyle } from './analyst-style-editor.mjs';
import { unsupportedClaimGuard } from './unsupported-claim-guard.mjs';
import { antiTemplateGuardV2 } from './anti-template-guard-v2.mjs';
import { humanStyleScore } from './human-style-score.mjs';
import { insightDensityScore } from './insight-density-score.mjs';
import { sourceSummaryRatio } from './source-summary-ratio.mjs';
import { copyrightSafeCopyGuard } from './copyright-safe-copy-guard.mjs';

function dedupeLongBlocks(text = '') {
  const seen = new Set();
  return String(text || '')
    .split(/\n{2,}/)
    .filter((block) => {
      const key = block
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (key.length < 90) return true;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .join('\n\n');
}

export function finalCopyChief({ body = '', ledger = [], sourceText = '', route = 'Standard Analysis' } = {}) {
  const edited = dedupeLongBlocks(editAnalystStyle(body));
  const unsupported = unsupportedClaimGuard(edited, ledger);
  const antiTemplate = antiTemplateGuardV2(edited);
  const human = humanStyleScore(edited);
  const insight = insightDensityScore(edited);
  const summaryRatio = sourceSummaryRatio(edited, sourceText);
  const copyright = copyrightSafeCopyGuard({ generatedText: edited, sourceText });
  const ok = unsupported.ok
    && antiTemplate.ok
    && human.human_style_score >= 0.84
    && insight.insight_density_score >= 0.78
    && summaryRatio.source_summary_ratio <= 0.35
    && copyright.ok;
  return {
    ok,
    body: edited,
    metrics: {
      human_style_score: human.human_style_score,
      insight_density_score: insight.insight_density_score,
      source_fidelity_score: unsupported.ok ? 0.91 : 0.58,
      anti_template_score: antiTemplate.anti_template_score,
      source_summary_ratio: summaryRatio.source_summary_ratio,
      analysis_ratio: 1 - summaryRatio.source_summary_ratio,
      unsupported_claim_count: unsupported.unsupportedNumbers.length + unsupported.unsupportedLedger.length,
      forbidden_phrase_count: antiTemplate.matches.length,
      repeated_paragraph_count: antiTemplate.repeatedParagraphCount,
      copyright_overlap_score: copyright.overlap_score,
      route,
    },
    reasons: [
      ...unsupported.reasons,
      ...antiTemplate.reasons,
      ...human.reasons,
      ...insight.reasons,
      ...summaryRatio.reasons,
      ...copyright.reasons,
    ],
  };
}
