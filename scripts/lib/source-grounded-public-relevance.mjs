import { classifyInfrastructureRelevance } from './relevance-classifier.mjs';

const STRONG_INFRASTRUCTURE_TITLE = /\b(ai infrastructure|ai data cent(?:er|re)|data cent(?:er|re)s?|datacenter|cloud infrastructure|cloud region|cloud capacity|hyperscale|hyperscaler|interconnection|substation|transmission|765\s*kv|liquid[- ]cooling|direct[- ]to[- ]chip|rack|server|supercomput|semiconductor|chipmaker|foundry|fabrication|fab\b|hbm|high[- ]bandwidth memory|accelerator|gpu liquidity|fiber|fibre|connectivity corridor|thermal monitoring|powerstore|poweredge|storage infrastructure|kv cache)\b/i;
const SOURCE_INFRASTRUCTURE_ANCHOR = /\b(ai campus|ai infrastructure|data cent(?:er|re)s?|datacenter|cloud region|hyperscale|interconnection|substation|transmission|utility|grid|power equipment|transformer|liquid[- ]cooling|rack|server|semiconductor|foundry|fab\b|hbm|accelerator|fiber|fibre|storage infrastructure)\b/i;
const CONSUMER_OR_OFF_TOPIC_TITLE = /\b(gaming|game|stream deck|handheld|laptop|webcam|monitor|retro|floppy|upgrade your pc|pc bundle|at home|graphics card|3d printer|browser|smartphone|robot dog|captcha|starlink|orbital satellite|social media|email inbox|ai agents?|agentic|chatbot|coding assistant|software release)\b/i;
const UNSAFE_GENERATED_SOURCE_TEXT = /\b(remains a source-linked ai infrastructure signal|compact signal on ai capacity planning|gives infrastructure readers)\b/i;

function firstSourceText(article = {}) {
  return String(
    article.contentText
      || article.extractedText
      || article.cleaned_source_text
      || article.sourceText
      || article.rawText
      || '',
  ).trim();
}

function persistedScore(article = {}) {
  return Number(
    article.infrastructure_relevance_score
      ?? article.infrastructure_relevance?.infrastructure_relevance_score
      ?? article.public_routing?.score
      ?? 0,
  );
}

export function sourceGroundedPublicRelevance(article = {}) {
  const title = String(article.title || '').trim();
  const sourceText = firstSourceText(article);
  const result = classifyInfrastructureRelevance({
    title,
    contentText: sourceText,
    source: article.source,
    url: article.sourceUrl || article.url,
  });
  const score = Number(result.infrastructure_relevance_score || 0);
  const hardNegative = CONSUMER_OR_OFF_TOPIC_TITLE.test(title);
  const strongTitle = STRONG_INFRASTRUCTURE_TITLE.test(title);
  const unsafeSourceText = UNSAFE_GENERATED_SOURCE_TEXT.test(sourceText);
  const sourceAnchored = !unsafeSourceText && SOURCE_INFRASTRUCTURE_ANCHOR.test(`${title} ${sourceText}`);
  const pipelineManaged = Boolean(
    article.infrastructure_relevance
      || article.public_routing
      || article.generation_version
      || article.public_generation_version,
  );
  const legacyFallback = !pipelineManaged && persistedScore(article) >= 0.55;
  const ok = Boolean(
    title
      && !hardNegative
      && (
        score >= 0.55
        || (strongTitle && score >= 0.28)
        || (sourceAnchored && score >= 0.4)
        || legacyFallback
      ),
  );

  return {
    ok,
    score,
    strongTitle,
    sourceAnchored,
    unsafeSourceText,
    hardNegative,
    usedLegacyFallback: legacyFallback,
  };
}

export function sourceGroundedPublicRelevant(article = {}) {
  return sourceGroundedPublicRelevance(article).ok;
}
