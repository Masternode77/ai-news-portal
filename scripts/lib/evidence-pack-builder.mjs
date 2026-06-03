import { detectBoilerplate } from './boilerplate-detector.mjs';
import { detectTruncationArtifacts } from './truncation-detector.mjs';
import { normalizeProperNouns } from './proper-noun-normalizer.mjs';
import { namesConcreteInfrastructureLayer } from './strict-infrastructure-relevance-router.mjs';
import { forbiddenPublicPhraseMatches } from './copy-quality-guard.mjs';
import { publicTemplatePhraseMatches } from './public-template-phrase-guard.mjs';

const INFRA_LAYERS = [
  ['power', /\b(power|grid|utility|electricity|ppa|substation|transformer)\b/i],
  ['data center facility', /\b(data centers?|datacenters?|colocation|campus|facility|facilities)\b/i],
  ['cooling', /\b(cooling|thermal|liquid cooling|cdu|mep)\b/i],
  ['semiconductor supply', /\b(semiconductor|chip|wafer|packaging|equipment)\b/i],
  ['accelerator systems', /\b(gpu|accelerator|nvidia|amd|training cluster|inference)\b/i],
  ['memory', /\b(hbm|memory|dram|ddr|vm density)\b/i],
  ['networking', /\b(network|ethernet|infiniband|fiber|connectivity)\b/i],
  ['storage', /\b(storage|backup|disaster recovery|data management)\b/i],
  ['enterprise platform infrastructure', /\b(openshift|kubernetes|platform|virtualization|hyper-v|kvm|proxmox|nutanix)\b/i],
  ['capital formation for AI infrastructure', /\b(capital|funding|financing|debt|equity|stake|acquisition|joint venture)\b/i],
  ['permitting and siting', /\b(permit|permitting|siting|zoning|moratorium|regulation|county)\b/i],
];

function compact(value = '') {
  return normalizeProperNouns(String(value || '').replace(/\s+/g, ' ').trim());
}

function compactLimited(value = '', limit = 2400) {
  const text = compact(value);
  if (text.length <= limit) return text;
  const clipped = text.slice(0, limit);
  const terminal = Math.max(clipped.lastIndexOf('. '), clipped.lastIndexOf('! '), clipped.lastIndexOf('? '));
  return terminal > 400 ? clipped.slice(0, terminal + 1) : `${clipped.replace(/\s+\S*$/, '')}.`;
}

function splitSentences(text = '') {
  return compact(text)
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 35 && sentence.length <= 260)
    .filter(isUsableEvidenceSentence);
}

function isUsableEvidenceSentence(sentence = '') {
  const text = compact(sentence);
  if (!text) return false;
  if (/(copyright|privacy policy|terms of use|newsletter|advertisement|registered office|want more)/i.test(text)) return false;
  if (forbiddenPublicPhraseMatches(text).length || publicTemplatePhraseMatches(text).length) return false;
  if (/public card stays short|watchlist signal more than a full infrastructure memo|infrastructure read limited to source-backed facts/i.test(text)) return false;
  if (/compute current is keeping|until clean evidence supports|available source text contains clipped/i.test(text)) return false;
  return true;
}

function cleanEvidenceSentences(text = '') {
  return splitSentences(text).join(' ');
}

function unique(values = []) {
  const seen = new Set();
  const out = [];
  for (const value of values.map(compact).filter(Boolean)) {
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

function titleFact(article = {}) {
  const title = compact(article.title);
  const source = compact(article.source || 'the source');
  return title ? `${source} reported: ${title}.` : '';
}

export function infrastructureLayerFromText(article = {}) {
  const text = compact([
    article.title,
    article.summary,
    article.snippet,
    article.articleText,
    article.contentText,
    article.infrastructure_layer,
    article.category,
  ].filter(Boolean).join(' '));
  return INFRA_LAYERS.find(([, pattern]) => pattern.test(text))?.[0] || (namesConcreteInfrastructureLayer(article) ? 'AI infrastructure' : '');
}

export function cleanEvidenceText(article = {}) {
  const raw = compactLimited([
    article.cleaned_source_text,
    article.source_evidence_text,
    article.contentText,
    article.articleText,
    article.fullArticleText,
    article.summary,
    article.snippet,
  ].filter(Boolean).map((value) => compactLimited(value, 1800)).join('\n\n'), 5000);
  const boilerplate = detectBoilerplate(raw);
  const text = compact(cleanEvidenceSentences(boilerplate.cleaned_text || raw));
  const truncation = detectTruncationArtifacts(text);
  return {
    text,
    boilerplate,
    truncation,
    ok: !boilerplate.copyright_footer_detected
      && boilerplate.boilerplate_ratio <= 0.08
      && truncation.ok
      && text.length >= 160,
  };
}

export function extractNamedActors(article = {}) {
  const text = compact([article.title, article.source, article.summary, article.snippet, article.articleText].filter(Boolean).map((value) => String(value).slice(0, 2200)).join(' '));
  const matches = text.match(/\b(?:[A-Z][A-Za-z0-9&.-]+(?:\s+[A-Z][A-Za-z0-9&.-]+){0,3}|NVIDIA|AMD|HBM|KVM|CDU|PPA|REIT)\b/g) || [];
  return unique(matches)
    .filter(isUsableActorName)
    .slice(0, 8);
}

function isUsableActorName(actor = '') {
  const text = compact(actor);
  if (!text) return false;
  if (/^(The|This|That|A|An|In|For|With|Source|Global|US|AI)$/.test(text)) return false;
  if (/\b(commercially|operationally)\b/i.test(text)) return false;
  if (forbiddenPublicPhraseMatches(text).length || publicTemplatePhraseMatches(text).length) return false;
  return true;
}

export function buildEvidencePack(article = {}, options = {}) {
  const cleaned = cleanEvidenceText(article);
  const source = compact(article.source || 'Original source');
  const title = compact(article.title || 'Untitled item');
  const summarySentences = splitSentences([article.summary, article.snippet].filter(Boolean).join(' '));
  const sourceSentences = splitSentences(cleaned.text).slice(0, 8);
  const infrastructureLayer = infrastructureLayerFromText(article);
  const actors = extractNamedActors(article);
  const facts = unique([
    titleFact(article),
    ...summarySentences,
    ...sourceSentences,
    infrastructureLayer ? `${title} connects to ${infrastructureLayer} decisions tracked by Compute Current.` : '',
    actors.length ? `${source} names ${actors.slice(0, 4).join(', ')} as relevant actors or entities.` : '',
  ]).filter(isUsableEvidenceSentence).slice(0, 8);
  const factTarget = options.factTarget || 3;
  const blockReasons = [];

  if (!cleaned.ok) blockReasons.push('unclean_or_short_evidence');
  if (!infrastructureLayer) blockReasons.push('missing_infrastructure_layer');
  if (facts.length < factTarget) blockReasons.push(`facts_below_${factTarget}`);

  const watchMetrics = unique([
    infrastructureLayer === 'power' ? 'interconnection queue movement and tariff exposure' : '',
    infrastructureLayer === 'data center facility' ? 'site readiness, leasing, and power delivery milestones' : '',
    infrastructureLayer === 'cooling' ? 'rack-density adoption and liquid cooling deployment dates' : '',
    infrastructureLayer === 'semiconductor supply' ? 'equipment lead times, packaging capacity, and buyer allocation' : '',
    infrastructureLayer === 'memory' ? 'HBM and DRAM pricing against VM density assumptions' : '',
    infrastructureLayer === 'storage' ? 'restore-time targets, data movement cost, and platform coverage' : '',
    infrastructureLayer === 'enterprise platform infrastructure' ? 'production workload migration and recovery performance' : '',
    'contracted capacity, delivery timing, and operating cost variance',
  ]).slice(0, 3);

  return {
    ok: blockReasons.length === 0,
    blockReasons,
    source,
    title,
    evidenceText: cleaned.text,
    facts,
    namedActors: actors,
    affectedInfrastructureLayer: infrastructureLayer,
    whyThisMattersNow: `${title} matters now because infrastructure buyers need to separate credible capacity signals from unsupported market noise.`,
    commercialImplication: `The commercial read is how buyers, operators, and investors should price capacity, cost, or execution risk around ${infrastructureLayer || 'AI infrastructure'}.`,
    operatingImplication: `The operating read is whether the reported event changes deployable capacity, platform resilience, or execution risk in a measurable way.`,
    whoBenefits: actors.slice(0, 3).length ? actors.slice(0, 3) : ['operators with disciplined capacity planning'],
    whoIsExposed: ['buyers relying on unsupported capacity signals', 'teams with weak source evidence'],
    counterargument: 'The limitation is that the source may describe a useful signal without proving that timing, economics, or deployment risk has changed yet.',
    whatWouldChangeOurView: watchMetrics[0] || 'cleaner evidence of committed capacity and operating impact',
    watchMetrics,
    sourceLimitations: cleaned.text.length < 1200 ? 'The extracted source evidence is concise, so the article should avoid unsupported claims.' : 'The extracted evidence is sufficient for local analysis, but source attribution remains necessary.',
  };
}
