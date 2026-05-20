export function buildResearchBrief(article = {}, evidencePack = {}) {
  const facts = evidencePack.facts || [];
  return {
    what_happened: facts[0] || article.title || 'A relevant infrastructure item was identified.',
    why_it_matters: evidencePack.whyThisMattersNow,
    what_is_not_proven: evidencePack.counterargument,
    context: `${evidencePack.affectedInfrastructureLayer || 'AI infrastructure'} is the layer that makes this item relevant to Compute Current readers.`,
    key_uncertainty: evidencePack.whatWouldChangeOurView,
    source_limitations: evidencePack.sourceLimitations,
    recommended_article_route: article.blog_route || article.publishing_route || 'standard_blog',
  };
}
