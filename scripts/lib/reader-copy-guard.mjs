import { isAuthoredColumn } from './authored-column-identity.mjs';
import { safeHttpUrl } from './normalize.mjs';
import { epochArticleTarget } from './epoch-ai.mjs';
import { isRenderedCorrection } from './editorial-corrections.mjs';

// Reader-facing copy only. This detector never rewrites text or certifies facts.
// Keep input-provenance rules specific: "prompt", "model" and uncertainty are
// legitimate subjects in AI reporting, not evidence of a leaked instruction.
//
// `input_provenance` fires only when an extract, excerpt or evidence has no
// attributed supplier: a determiner directly before "supplied"/"provided"
// ("the supplied extract"), a sentence that opens with it ("Provided excerpts
// show", "Supplied source text does not include", also after a heading,
// paragraph break, colon label, opening quote, bracket, bullet or numbered
// list marker), a
// prepositional or participial use with no supplier ("based on provided
// excerpts", "using supplied extracts", "based on supplied evidence"), or the
// writer as recipient ("the evidence I was given", "we were provided
// excerpts", "the excerpt was provided to us"). Prose that
// names who supplied what ("the vendor provided excerpts of the contract",
// "EIA provided excerpts from the filing", "The supplier provided evidence of
// the delay") is ordinary attribution and passes;
// so do "Abstract Excerpt:" labels and the verb "to extract value". A
// demonstrative counts only before a singular extract/excerpt ("this provided
// excerpt"); before a plural or before "evidence" it reads as a subject with a
// verb ("This provided excerpts from the filing to reviewers", "This provided
// evidence that the forecast was conservative").
const RULES = [
  ['input_provenance', /\b(?:the|my|our|its|their)\s+(?:supplied|provided)\s+(?:extracts?|excerpts?|evidence|source\s+text)\b|\b(?:this|that)\s+(?:supplied|provided)\s+(?:extract|excerpt)\b|(?<=(?:^|[.!?:;]|\n)[\s"“”'‘’(\[>*#•\-–—]*(?:\(?\d{1,3}[.)]\s*)?)(?:supplied|provided)\s+(?:extracts?|excerpts?|evidence|source\s+text)\b|\b(?:using|based\s+on|from|with|of|on|via|per)\s+(?:supplied|provided)\s+(?:extracts?|excerpts?|evidence|source\s+text)\b|\b(?:extracts?|excerpts?|evidence|source\s+text)\s+(?:that\s+)?(?:I|we)\s+(?:was|were|have\s+been|had\s+been)\s+(?:given|supplied|provided|handed)\b|\b(?:I|we)\s+(?:was|were|have\s+been|had\s+been)\s+(?:given|supplied|provided|handed)\s+(?:the\s+|an?\s+|these\s+|those\s+|some\s+)?(?:extracts?|excerpts?|evidence|source\s+text)\b|\b(?:extracts?|excerpts?|evidence|source\s+text)\s+(?:was|were|has\s+been|have\s+been)\s+(?:given|supplied|provided|handed)\s+to\s+(?:me|us)\b|\b(?:anything|everything)\s+I\s+have\s+been\s+given\b/gi],
  ['writer_extract', /\b(?:the|an?)\s+extract\s+(?:I|we)\s+(?:have|received|was|were)\b/gi],
  ['process_assurance', /\bI\s+will\s+not\s+invent\s+(?:answers|facts|numbers)\b|\bI\s+am\s+committing\s+to\s+that\s+distinction\b|\bI\s+own\s+this\s+thesis\s+outright\b/gi],
  ['persona_scaffold', /\b(?:my|two|both)\s+standing\s+positions?\b|\bone\s+of\s+my\s+standing\s+positions?\b/gi],
  ['generation_field', /\b(?:systemPrompt|userPrompt|finalArticleBody|verified_claims|body_blocks|qualityFeedback)\b|\bevidence\.source_text\b/gi],
  ['instruction_scaffold', /\breturn\s+(?:only\s+)?strict\s+JSON\b|\bdo\s+not\s+return\s+a\s+body\s+string\b/gi],
];

/**
 * An allowlist of public fields; private source/review objects stay private.
 * `snippet`, `why_it_matters` and `expertLensShort` render on cards and detail
 * pages next to the deck, so they are reader copy too. Source evidence fields
 * (`articleText`, `cleaned_source_text`, `rawText`) are never inspected: a
 * publisher may legitimately write "excerpts" or "provided" in its own text.
 */
export function readerCopySurfaces(candidate = {}) {
  const surfaces = [];
  const add = (field, text) => {
    if (typeof text === 'string' && text.trim()) surfaces.push({ field, text });
  };
  // `articleImageAlt()` renders `imageAlt || image_alt`, so both spellings count.
  const full = candidate.expertLensFull || {};
  const persisted = candidate.public_presentation || {};
  // Renderer truthiness, not trimmed presence: the templates and
  // buildPublicPresentation() select with `a || b`, so a whitespace-only
  // persisted value still wins and the top-level fallback stays hidden.
  const shown = (value) => Boolean(value);
  // Precedence follows the renderers. Both the news and the column template
  // show expertLensFull.finalArticleBody and ignore a legacy top-level body
  // when both exist. News records then go through buildPublicPresentation,
  // which prefers the persisted deck, why-it-matters and image alt over the
  // top-level fields; a shadowed fallback is not reader copy there, so stale
  // text in it cannot fail a gate. Authored columns bypass that layer
  // (column/[slug].astro and buildColumnCards read deck and imageAlt
  // directly), so their top-level fields always count.
  const viaPresentation = !isAuthoredColumn(candidate);
  // displayHeadline(), generateCardCopy()/buildPublicPresentation() (and so
  // the page title, structured data, RSS, catalog, ticker and newsletter) all
  // read expertLensFull.finalHeadline before the raw title, so a final
  // headline shadows the raw title for a news record. The hub and entity
  // lists print a feed record's raw title; the audit covers that from the
  // feed. A column page prints its title directly. Top-level `headline` is
  // read by no renderer.
  if (!viaPresentation || !shown(full.finalHeadline)) add('title', candidate.title);
  // summary, snippet, expertLensShort and expertLensFull.metaDescription are
  // deck fallbacks only: the news page's description chain
  // (presentation.deck || expertLensFull.metaDescription || summary || snippet),
  // the RSS description (presentation.deck || card deck || expertLensShort ||
  // summary || snippet) and the catalog deck (signal.deck || deck || summary)
  // all read them behind the deck, and a stored deck (persisted or top-level)
  // always yields a non-empty presentation deck. A column prints summary as
  // its page description (summary || deck), so summary always counts there.
  // Top-level metaDescription is not read by any renderer.
  const deckStored = shown(persisted.deck) || shown(candidate.deck);
  if (!viaPresentation || !deckStored) add('summary', candidate.summary);
  if (!deckStored) {
    add('snippet', candidate.snippet);
    add('expertLensShort', candidate.expertLensShort);
    add('expertLensFull.metaDescription', full.metaDescription);
  }
  if (!shown(full.finalArticleBody)) add('body', candidate.body);
  if (!viaPresentation || !shown(persisted.deck)) add('deck', candidate.deck);
  if (!viaPresentation || !shown(persisted.why_it_matters)) add('why_it_matters', candidate.why_it_matters);
  if (!viaPresentation || !shown(persisted.image_alt)) {
    add('imageAlt', candidate.imageAlt);
    add('image_alt', candidate.image_alt);
  }
  for (const field of ['finalHeadline', 'finalArticleBody']) {
    add(`expertLensFull.${field}`, full[field]);
  }
  // Persisted presentation copy that buildPublicPresentation can actually
  // render: deck, why-it-matters and image alt win over the top-level fields;
  // label, lens and lane are fallbacks behind the route. The persisted title,
  // region, source and category are never read by the renderer (title comes
  // from card copy or the headline, the rest from top-level fields), so they
  // are not reader copy and stale values there cannot block the gate.
  const presentation = persisted;
  for (const field of ['deck', 'why_it_matters', 'image_alt']) {
    add(`public_presentation.${field}`, presentation[field]);
  }
  // Reader-impact labels render as visible pills on every card.
  for (const [i, label] of (Array.isArray(presentation.reader_impact) ? presentation.reader_impact : []).entries()) {
    add(`public_presentation.reader_impact[${i}]`, label);
  }
  // Card metadata chips: label, lens and lane render on signal cards, article
  // cards and the featured card from the route object. normalizedRoute()
  // always supplies a non-empty label, lens and lane (with hardcoded
  // fallbacks) before buildPublicPresentation() reads the persisted
  // public_presentation.signal_label|editorial_lens|lane_title, so those
  // persisted values never render and are not surfaces. No component renders
  // the lane title either (the homepage lane strip is a hardcoded list), so
  // public_routing.laneTitle is not a surface; a deck it helps generate is
  // audited as the deck.
  const routing = candidate.public_routing || {};
  for (const field of ['public_signal_label', 'editorial_lens']) {
    add(`public_routing.${field}`, routing[field]);
  }
  for (const field of ['region', 'source', 'category', 'primary_category']) {
    add(field, candidate[field]);
  }
  // A column's thesis feeds the publication catalog's "why it matters" line
  // and the weekly digest.
  add('stance.thesis', candidate.stance?.thesis);
  // Tag pills on the news page, the column byline, and the column's source list.
  for (const [i, tag] of (Array.isArray(candidate.tags) ? candidate.tags : []).entries()) add(`tags[${i}]`, tag);
  const author = candidate.author || {};
  for (const field of ['name', 'role']) add(`author.${field}`, author[field]);
  // column/[slug].astro keeps only sources with a safe http(s) URL and a name,
  // links `title || name`, prints `name`, and shows `author` only in the Epoch
  // AI licence line (SourceLicense). `publisher` is never rendered. The
  // publication catalog (columnPublications) also prints the first source's
  // name on PublicationCard whatever its URL, so sources[0].name always counts.
  for (const [i, source] of (Array.isArray(candidate.sources) ? candidate.sources : []).entries()) {
    if (!source || typeof source !== 'object') continue;
    const url = safeHttpUrl(source.url);
    const kept = Boolean(url) && shown(source.name);
    if (i === 0 || kept) add(`sources[${i}].name`, source.name);
    if (!kept) continue;
    add(`sources[${i}].title`, source.title);
    if (epochArticleTarget(url)) add(`sources[${i}].author`, source.author);
  }
  // correctionNotes() renders only dated notes (YYYY-MM-DD) with a summary.
  for (const [i, note] of (Array.isArray(candidate.corrections) ? candidate.corrections : []).entries()) {
    if (isRenderedCorrection(note)) add(`corrections[${i}].summary`, note.summary);
  }
  // Figures render only on the column page (ColumnFigure); news/[id].astro
  // never reads them, and ColumnFigure emits nothing for a figure without
  // items.
  for (const [i, figure] of (Array.isArray(candidate.figures) && viaPresentation === false ? candidate.figures : []).entries()) {
    if (!figure || typeof figure !== 'object') continue;
    if (!(Array.isArray(figure.items) && figure.items.length)) continue;
    add(`figures[${i}].title`, figure.title);
    add(`figures[${i}].source_note`, figure.source_note);
    // ColumnFigure prints label and display for stat-row and bar figures,
    // label, display and source for a table, and no item fields for any
    // other type (the caption still renders).
    const itemFields = figure.type === 'table' ? ['label', 'display', 'source']
      : figure.type === 'stat-row' || figure.type === 'bar' ? ['label', 'display']
        : [];
    for (const [j, item] of figure.items.entries()) {
      if (!item || typeof item !== 'object') continue;
      for (const key of itemFields) add(`figures[${i}].items[${j}].${key}`, item[key]);
    }
  }
  return surfaces;
}

export function readerCopyResult(candidate = {}) {
  const findings = [];
  for (const { field, text } of readerCopySurfaces(candidate)) {
    // Normalize whitespace, not meaning. Runs of spaces collapse to one space
    // and every line break collapses to one "\n", so a paragraph or heading
    // boundary still counts as a sentence start for the rules above. No
    // destructive sanitization or silent substitution of "the publication"
    // for an incomplete source extraction.
    const normalized = text.normalize('NFKC').replace(/[^\S\n]+/g, ' ').replace(/\s*\n\s*/g, '\n');
    for (const [code, pattern] of RULES) {
      for (const match of normalized.matchAll(new RegExp(pattern.source, pattern.flags))) {
        findings.push({
          code, field, match: match[0],
          excerpt: normalized.slice(Math.max(0, match.index - 45), match.index + match[0].length + 65),
        });
      }
    }
  }
  return {
    ok: findings.length === 0,
    findings,
    reasons: [...new Set(findings.map(({ code, field }) => `reader_copy:${code}:${field}`))],
  };
}

/** Triage signals, NOT factual-error verdicts or automatic publication blocks. */
export function editorialReviewWarnings(candidate = {}) {
  const warnings = [];
  const title = candidate.title || candidate.headline || candidate.expertLensFull?.finalHeadline || '';
  const body = candidate.body || candidate.expertLensFull?.finalArticleBody || '';
  if (/\b(?:I have argued for|I have written before|I have watched|the first .* I have seen)\b/i.test(body)) {
    warnings.push({ code: 'personal_history_needs_evidence', field: 'body' });
  }
  for (const [i, figure] of (Array.isArray(candidate.figures) ? candidate.figures : []).entries()) {
    if (!figure || typeof figure !== 'object') continue;
    if (figure.title === title) warnings.push({ code: 'figure_repeats_headline', field: `figures[${i}].title` });
    // Figures are a column surface; mark the probe as a column so they count.
    for (const { field, text } of readerCopySurfaces({ content_origin: 'authored', figures: [figure] })) {
      const publicField = field.replace('figures[0]', `figures[${i}]`);
      if (/…|\.{3}/.test(text)) warnings.push({ code: 'figure_excerpt_ellipsis', field: publicField });
      if (/\.(title|label)$/.test(field) && text.trim().split(/\s+/).length >= 8
        && /\b(?:the|a|an|to|with|of|for|and|or|that|which|is|are|from|into|by|its|their|has|have)\s*$/i.test(text)) {
        warnings.push({ code: 'figure_possible_clipping', field: publicField });
      }
    }
  }
  return warnings;
}
