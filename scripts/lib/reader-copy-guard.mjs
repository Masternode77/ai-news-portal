// Reader-facing copy only. This detector never rewrites text or certifies facts.
// Keep input-provenance rules specific: "prompt", "model" and uncertainty are
// legitimate subjects in AI reporting, not evidence of a leaked instruction.
//
// `input_provenance` fires only when an extract, excerpt or evidence has no
// attributed supplier: a determiner directly before "supplied"/"provided"
// ("the supplied extract"), a sentence that opens with it ("Provided excerpts
// show", also after a heading or paragraph break), or the writer as recipient
// ("the evidence I was given"). Prose that
// names who supplied what ("the vendor provided excerpts of the contract",
// "EIA provided excerpts from the filing") is ordinary attribution and passes;
// so do "Abstract Excerpt:" labels and the verb "to extract value".
const RULES = [
  ['input_provenance', /\b(?:the|this|that|these|those|my|our|its|their|any|all)\s+(?:supplied|provided)\s+(?:extracts?|excerpts?|evidence|source\s+text)\b|(?<=^|[.!?]\s+|\n)(?:supplied|provided)\s+(?:extracts?|excerpts?)\b|\b(?:extracts?|excerpts?|evidence|source\s+text)\s+(?:that\s+)?(?:I|we)\s+(?:was|were|have\s+been|had\s+been)\s+(?:given|supplied|provided|handed)\b|\b(?:anything|everything)\s+I\s+have\s+been\s+given\b/gi],
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
  for (const field of ['title', 'headline', 'deck', 'summary', 'snippet', 'why_it_matters', 'expertLensShort', 'metaDescription', 'body', 'imageAlt']) {
    add(field, candidate[field]);
  }
  const full = candidate.expertLensFull || {};
  for (const field of ['finalHeadline', 'metaDescription', 'finalArticleBody']) {
    add(`expertLensFull.${field}`, full[field]);
  }
  // Persisted presentation copy wins over the top-level fields when a card or
  // detail page is rendered (buildPublicPresentation), so it is reader copy too.
  const presentation = candidate.public_presentation || {};
  for (const field of ['title', 'deck', 'why_it_matters', 'image_alt']) {
    add(`public_presentation.${field}`, presentation[field]);
  }
  for (const [i, note] of (Array.isArray(candidate.corrections) ? candidate.corrections : []).entries()) {
    if (note && typeof note === 'object') add(`corrections[${i}].summary`, note.summary);
  }
  for (const [i, figure] of (Array.isArray(candidate.figures) ? candidate.figures : []).entries()) {
    if (!figure || typeof figure !== 'object') continue;
    add(`figures[${i}].title`, figure.title);
    add(`figures[${i}].source_note`, figure.source_note);
    for (const [j, item] of (Array.isArray(figure.items) ? figure.items : []).entries()) {
      if (!item || typeof item !== 'object') continue;
      for (const key of ['label', 'display', 'source']) add(`figures[${i}].items[${j}].${key}`, item[key]);
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
    for (const { field, text } of readerCopySurfaces({ figures: [figure] })) {
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
