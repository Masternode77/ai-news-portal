import { blogStyleQualityScore } from './blog-style-quality-score.mjs';
import { sourceFidelityCheck } from './source-fidelity-check.mjs';

export function humanBlogQualityScore(article = {}, evidencePack = {}, body = article.expertLensFull?.finalArticleBody || '') {
  const route = article.blog_route || 'standard_blog';
  const style = blogStyleQualityScore(body, route);
  const fidelity = sourceFidelityCheck(article, evidencePack, body);
  const text = String(body || '');
  const insightDensity = /\b(commercial|operating|capacity|risk|cost|timing|procurement|capital|deployment)\b/gi.test(text) ? 0.81 : 0.62;
  const antiTemplate = style.reasons.length ? 0.86 : 0.94;
  const humanScore = Math.min(0.97, (style.blog_style_quality_score + fidelity.source_fidelity_score + insightDensity + antiTemplate) / 4);
  return {
    ok: humanScore >= 0.82 && insightDensity >= 0.75 && fidelity.source_fidelity_score >= 0.85 && antiTemplate >= 0.85,
    human_blog_quality_score: Number(humanScore.toFixed(3)),
    insight_density_score: insightDensity,
    source_fidelity_score: fidelity.source_fidelity_score,
    anti_template_score: antiTemplate,
    reasons: [...style.reasons, ...fidelity.unsupported],
    style,
    fidelity,
  };
}
