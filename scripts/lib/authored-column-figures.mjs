// Evidence figures for The Current columns.
//
// Every published column carries 1-3 visual elements (stat rows, tables,
// bar comparisons) built exclusively from verified_primary numeric claims in
// the story's claim ledger — the same evidence contract as the prose. The
// model may propose figure specs; anything invalid falls back to a
// deterministic construction so the mandate never blocks publication on
// model formatting whims. Titles are derived from the column's own argument
// and evidence, never from fixed labels, so they vary column to column.
import { bannedPhraseMatches } from './banned-phrases.mjs';
import { guardPublicTemplatePhrases } from './public-template-phrase-guard.mjs';

export const FIGURE_TYPES = ['stat-row', 'table', 'bar'];
const MAX_FIGURES = 3;
const MAX_ITEMS_PER_FIGURE = 5;
const TITLE_MIN = 8;
const TITLE_MAX = 64;

const NAMED_ENTITIES = {
  amp: '&', quot: '"', apos: "'", nbsp: ' ',
  rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“',
  ndash: '–', mdash: '—', hellip: '…',
};

export function decodeEntities(text = '') {
  return String(text || '')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&([a-z]+);/gi, (match, name) => NAMED_ENTITIES[name.toLowerCase()] ?? match);
}

function condense(text = '', limit = TITLE_MAX) {
  const cleaned = decodeEntities(String(text || ''))
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[.!?,;:]+$/g, '')
    .trim();
  if (cleaned.length <= limit) return cleaned;
  const slice = cleaned.slice(0, limit + 1);
  const cut = slice.lastIndexOf(' ');
  return slice.slice(0, cut > TITLE_MIN ? cut : limit).replace(/[.!?,;:]+$/g, '').trim();
}

function labelFor(claim) {
  return condense(claim.claim_text, 96);
}

// Titles derived from a claim take its first clause only, so a truncated
// headline-plus-lead blob never becomes a figure caption.
function claimTitle(text = '') {
  const decoded = decodeEntities(String(text || ''));
  const clause = decoded.split(/[,;:]|\s[—–]\s|\bthat\b/)[0] || decoded;
  return condense(clause);
}

function formatValue(value, unit) {
  const number = Number(value);
  const rendered = Number.isInteger(number) ? String(number) : String(Number(number.toFixed(2)));
  return unit ? `${rendered} ${unit}` : rendered;
}

// Wire snippets are terse, so the strict pipeline extractor often finds no
// unit-bearing numbers even in claims that clearly carry them ($4 billion,
// 800 VDC, 96 GB). Figures use this wider matcher — display only; the
// unsupported-claims GATE keeps the strict shared extractor.
const FIGURE_NUMBER_PATTERN = /(\$\s?\d[\d,]*(?:\.\d+)?)\s*(billion|million|trillion|bn|B\b|M\b)?|\b(\d[\d,]*(?:\.\d+)?)\s?(GW|MW|kW|MWh|GWh|kWh|TWh|VDC|kV|volts?|watts?|TB|GB|PB|Gb|Gbps|Tbps|nm|percent|%|billion|million|trillion|years?|months?|weeks?|days?|hours?|racks?|GPUs?|servers?|acres?)\b/g;

export function extractFigureNumbers(text = '') {
  const matches = [...String(text || '').matchAll(FIGURE_NUMBER_PATTERN)];
  return matches.map((match) => {
    if (match[1]) {
      const magnitude = match[2] ? ` ${match[2]}` : '';
      return { display: `${match[1].replace(/\s/g, '')}${magnitude}`, value: Number(match[1].replace(/[$,\s]/g, '')), unit: `$${match[2] || ''}`.trim(), index: match.index };
    }
    return { display: `${match[3]} ${match[4]}`, value: Number(match[3].replace(/,/g, '')), unit: match[4], index: match.index };
  }).filter((item) => Number.isFinite(item.value));
}

function verifiedPrimaryClaims(ledger = {}) {
  return (ledger.claims || []).filter((claim) => claim.verification_status === 'verified_primary');
}

// Aggregation-style source articles (weekly roundups) yield claims about many
// unrelated stories. Figures must stay on the column's own story, so claims
// are scored against the column's headline (double weight) and stance and
// anything scoring below the floor is dropped.
function contentTokens(text = '') {
  return new Set(
    decodeEntities(String(text || ''))
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((token) => token.length > 3)
  );
}

function sharedCount(a, b) {
  let count = 0;
  for (const token of a) if (b.has(token)) count += 1;
  return count;
}

function entityTokens(text = '') {
  return new Set(
    [...decodeEntities(String(text || '')).matchAll(/\b[A-Z][A-Za-z0-9-]{3,}\b/g)]
      .map((match) => match[0].toLowerCase())
  );
}

export function relevantClaims(claims = [], { headline = '', stance = {} } = {}) {
  const stanceText = [stance?.thesis, stance?.angle].filter(Boolean).join(' ');
  const titleTokens = contentTokens(headline);
  const stanceTokens = contentTokens(stanceText);
  const anchors = new Set([...entityTokens(headline), ...entityTokens(stanceText)]);
  return claims
    .map((claim) => {
      const claimTokens = contentTokens(claim.claim_text);
      const score = 2 * sharedCount(claimTokens, titleTokens) + sharedCount(claimTokens, stanceTokens);
      const anchored = !anchors.size || sharedCount(claimTokens, anchors) >= 1;
      return { claim, score, anchored };
    })
    .filter((entry) => entry.anchored && entry.score >= 2)
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.claim);
}

function withFigureNumber(claim) {
  if (Number.isFinite(Number(claim.numeric_value)) && String(claim.unit || '').trim()) {
    return { ...claim };
  }
  const [number] = extractFigureNumbers(claim.claim_text);
  if (!number) return null;
  return { ...claim, numeric_value: number.value, unit: number.unit, figure_display: number.display, figure_index: number.index };
}

export function numericLedgerClaims(ledger = {}) {
  return verifiedPrimaryClaims(ledger)
    .filter((claim) => looksLikeProse(claim.claim_text))
    .map(withFigureNumber)
    .filter(Boolean);
}

// Roundup articles carry table-of-contents blobs ("restrictions; IC
// training; NXP to buy Ambarella?; ...") that read as garbage in a figure
// row. A claim must look like a prose sentence to qualify.
function looksLikeProse(text = '') {
  const decoded = decodeEntities(String(text || ''));
  if ((decoded.match(/;/g) || []).length >= 2) return false;
  if (/\?\s*;|;\S/.test(decoded)) return false;
  return decoded.trim().split(/\s+/).length >= 8;
}

export function factLedgerClaims(ledger = {}) {
  return verifiedPrimaryClaims(ledger).filter(
    (claim) => String(claim.claim_text || '').trim().length >= 40 && looksLikeProse(claim.claim_text)
  );
}

// When the number was found deep in the claim text, window the label around
// it so the row's context and its figure line up.
function numberAlignedLabel(claim) {
  if (!Number.isFinite(claim.figure_index)) return labelFor(claim);
  const decoded = decodeEntities(String(claim.claim_text || '')).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  if (claim.figure_index <= 70) return labelFor(claim);
  const start = decoded.lastIndexOf(' ', Math.max(0, claim.figure_index - 60)) + 1;
  const windowed = decoded.slice(start).trim();
  return condense((start > 0 ? '\u2026' : '') + windowed, 96);
}

function itemFor(claim) {
  return {
    label: numberAlignedLabel(claim),
    value: Number(claim.numeric_value),
    unit: String(claim.unit || '').trim(),
    display: claim.figure_display || formatValue(claim.numeric_value, String(claim.unit || '').trim()),
    source: claim.source_name || 'Source',
  };
}

function factItemFor(claim) {
  return {
    label: labelFor(claim),
    value: null,
    unit: '',
    display: '',
    source: claim.source_name || 'Source',
  };
}

function sourceNote(items = []) {
  return [...new Set(items.map((item) => item.source).filter(Boolean))].join(' · ');
}

function titleOk(title = '') {
  const cleaned = condense(title);
  if (cleaned.length < TITLE_MIN || cleaned.length > TITLE_MAX) return false;
  if (bannedPhraseMatches(cleaned).length) return false;
  return guardPublicTemplatePhrases(cleaned).ok;
}

// Bars imply comparable magnitudes. Physical units and money with an
// explicit magnitude qualify; bare dollar figures (a $118 barrel next to a
// $4 gallon) do not.
const BAR_UNIT_PATTERN = /^(GW|MW|kW|MWh|GWh|kWh|TWh|VDC|kV|volts?|watts?|TB|GB|PB|Gb|Gbps|Tbps|nm|percent|%|racks?|GPUs?|servers?|acres?|years?|months?|billion|million|trillion|\$(billion|million|trillion|bn|B|M))$/i;

function barComparableUnit(unit = '') {
  return BAR_UNIT_PATTERN.test(String(unit || '').trim());
}

function clampAnchor(anchor, sectionCount) {
  const value = Number(anchor);
  const max = Math.max(1, sectionCount - 1);
  if (!Number.isFinite(value)) return Math.min(2, max);
  return Math.min(Math.max(1, Math.round(value)), max);
}

function buildFigure(type, title, claims, anchor, sectionCount) {
  const items = claims.slice(0, MAX_ITEMS_PER_FIGURE).map(itemFor);
  return {
    type,
    title: condense(title),
    anchor: clampAnchor(anchor, sectionCount),
    items,
    source_note: sourceNote(items),
  };
}

// Spec indexes address the model-visible verified_claims list (all
// verified_primary claims in ledger order). Selected claims must also pass
// the relevance filter, and numeric figure types need extractable numbers.
function validSpecFigure(spec, baseClaims, relevantIds, sectionCount) {
  if (!spec || !FIGURE_TYPES.includes(spec.type)) return null;
  if (!titleOk(spec.title)) return null;
  const indexes = Array.isArray(spec.claim_indexes) ? [...new Set(spec.claim_indexes.map(Number))] : [];
  if (!indexes.length || indexes.some((index) => !Number.isInteger(index) || index < 0 || index >= baseClaims.length)) return null;
  let selected = indexes.map((index) => baseClaims[index]);
  if (!selected.every((claim) => relevantIds.has(claim.claim_id))) return null;
  if (spec.type === 'bar' || spec.type === 'stat-row') {
    selected = selected.map(withFigureNumber);
    if (!selected.every(Boolean)) return null;
  } else {
    selected = selected.map((claim) => withFigureNumber(claim) || claim);
  }
  if (spec.type === 'bar') {
    const units = new Set(selected.map((claim) => claim.unit));
    if (selected.length < 3 || units.size !== 1 || !barComparableUnit(selected[0].unit)) return null;
  }
  if (spec.type === 'table' && selected.length < 2) return null;
  const items = selected.map((claim) => (Number.isFinite(Number(claim.numeric_value)) && String(claim.unit || '').trim() ? itemFor(claim) : factItemFor(claim)));
  return {
    type: spec.type,
    title: condense(spec.title),
    anchor: clampAnchor(spec.anchor, sectionCount),
    items: items.slice(0, MAX_ITEMS_PER_FIGURE),
    source_note: sourceNote(items),
  };
}

function distinctTitles(figures) {
  const seen = new Set();
  return figures.every((figure) => {
    const key = figure.title.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Deterministic construction: the largest same-unit group becomes a bar when
// it has 3+ members; otherwise 4+ claims make a table, fewer make a stat row.
// A second stat-row figure is added when enough distinct claims remain.
function deterministicFigures({ claims, stance, headline, sectionCount }) {
  if (!claims.length) return [];
  const primaryTitle = condense(stance?.angle || headline || claims[0].claim_text);
  const byUnit = new Map();
  for (const claim of claims) {
    const list = byUnit.get(claim.unit) || [];
    list.push(claim);
    byUnit.set(claim.unit, list);
  }
  const largestUnitGroup = [...byUnit.values()]
    .filter((group) => barComparableUnit(group[0]?.unit))
    .sort((a, b) => b.length - a.length)[0] || [];

  const figures = [];
  if (largestUnitGroup.length >= 3) {
    figures.push(buildFigure('bar', primaryTitle, largestUnitGroup, 2, sectionCount));
  } else if (claims.length >= 4) {
    figures.push(buildFigure('table', primaryTitle, claims, 2, sectionCount));
  } else {
    figures.push(buildFigure('stat-row', primaryTitle, claims, 2, sectionCount));
  }

  const used = new Set(figures.flatMap((figure) => figure.items.map((item) => item.label)));
  const remaining = claims.filter((claim) => !used.has(labelFor(claim)));
  if (remaining.length >= 2) {
    const secondTitle = claimTitle(remaining[0].claim_text);
    if (titleOk(secondTitle) && secondTitle.toLowerCase() !== figures[0].title.toLowerCase()) {
      figures.push(buildFigure('stat-row', secondTitle, remaining, 4, sectionCount));
    }
  }
  return figures.slice(0, MAX_FIGURES);
}

// Fact table for number-light stories: verified claims rendered as an
// on-the-record table with per-row source attribution.
function factTableFigure({ ledger, stance, headline, sectionCount }) {
  const facts = relevantClaims(factLedgerClaims(ledger), { headline, stance });
  if (facts.length < 1) return null;
  const title = condense(stance?.angle || headline || facts[0].claim_text);
  if (!titleOk(title)) return null;
  const items = facts.slice(0, MAX_ITEMS_PER_FIGURE).map(factItemFor);
  return {
    type: 'table',
    title,
    anchor: clampAnchor(2, sectionCount),
    items,
    source_note: sourceNote(items),
  };
}

export function buildColumnFigures({ ledger = {}, stance = {}, headline = '', sectionCount = 5, modelSpec = null } = {}) {
  const baseClaims = verifiedPrimaryClaims(ledger);
  const relevantIds = new Set(relevantClaims(baseClaims, { headline, stance }).map((claim) => claim.claim_id));
  const claims = relevantClaims(numericLedgerClaims(ledger), { headline, stance });

  if (Array.isArray(modelSpec) && modelSpec.length >= 1 && modelSpec.length <= MAX_FIGURES) {
    const fromSpec = modelSpec.map((spec) => validSpecFigure(spec, baseClaims, relevantIds, sectionCount));
    if (fromSpec.every(Boolean) && fromSpec.some((figure) => figure.items.length) && distinctTitles(fromSpec)) {
      return { figures: fromSpec, source: 'model_spec' };
    }
  }

  if (claims.length >= 2) {
    return { figures: deterministicFigures({ claims, stance, headline, sectionCount }), source: 'deterministic' };
  }

  const factTable = factTableFigure({ ledger, stance, headline, sectionCount });
  if (factTable) {
    const figures = [factTable];
    if (claims.length === 1) {
      const statTitle = claimTitle(claims[0].claim_text);
      if (titleOk(statTitle) && statTitle.toLowerCase() !== factTable.title.toLowerCase()) {
        figures.push(buildFigure('stat-row', statTitle, claims, 4, sectionCount));
      }
    }
    return { figures, source: 'fact_table' };
  }

  return { figures: [], reason: 'no_verified_claims' };
}
