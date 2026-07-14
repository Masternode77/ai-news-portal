export const SOURCE_EVIDENCE_FIELDS = [
  'cleaned_source_text',
  'extractedText',
  'sourceText',
  'rawText',
  'contentText',
  'articleText',
];

export const SOURCE_EXCERPT_FIELDS = SOURCE_EVIDENCE_FIELDS.filter((field) => field !== 'articleText');

const GENERATED_SOURCE_MARKERS = [
  /\bWhy it matters:\s*(?:(?:compute|facility|silicon|cloud platform|semiconductor supply|power|data center facility) constraints can change build schedules, buyer commitments, and cost assumptions before demand shows up in revenue|chip availability and performance per watt can reset cloud margins, buyer queues, and refresh timing)\.?/i,
  /\bconnects to\b.{0,180}\bdecisions tracked by Compute Current\b/i,
  /\bnames\b.{0,180}\bas relevant actors or entities\b/i,
  /\bdecision point for capacity planners\b/i,
  /\bmatters most for capacity-per-watt planning\b/i,
  /\bis a capacity signal for operators tracking\b/i,
  /\bgives infrastructure readers a compact signal\b/i,
  /\bgives enterprise infrastructure teams another read on\b/i,
];

function compact(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function comparisonKey(value = '') {
  return compact(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function sentenceStart(text = '', offset = 0) {
  const prefix = text.slice(0, offset);
  const boundary = Math.max(prefix.lastIndexOf('. '), prefix.lastIndexOf('! '), prefix.lastIndexOf('? '));
  return boundary < 0 ? 0 : boundary + 2;
}

function reportedTitleOffset(text = '', article = {}) {
  const titleKey = comparisonKey(article.title);
  if (!titleKey) return -1;
  const titlePrefix = titleKey.slice(0, Math.min(56, titleKey.length));
  const reported = /\breported:\s*/gi;
  for (const match of text.matchAll(reported)) {
    if (comparisonKey(text.slice(match.index + match[0].length)).startsWith(titlePrefix)) {
      return sentenceStart(text, match.index);
    }
  }
  return -1;
}

function generatedMarkerOffset(text = '', article = {}) {
  const offsets = GENERATED_SOURCE_MARKERS
    .map((pattern) => {
      const match = pattern.exec(text);
      return match ? sentenceStart(text, match.index) : -1;
    })
    .filter((offset) => offset >= 0);
  const reportedOffset = reportedTitleOffset(text, article);
  if (reportedOffset >= 0) offsets.push(reportedOffset);
  return offsets.length ? Math.min(...offsets) : -1;
}

export function stripGeneratedSourceScaffolding(value = '', article = {}) {
  const text = compact(value);
  const offset = generatedMarkerOffset(text, article);
  if (offset < 0) return { text, contaminated: false };
  return {
    text: text.slice(0, offset).trim(),
    contaminated: true,
  };
}

export function sanitizeArticleSourceEvidence(article = {}) {
  const sanitized = { ...article };
  const contaminatedFields = [];
  for (const field of SOURCE_EVIDENCE_FIELDS) {
    if (!article[field]) continue;
    const result = stripGeneratedSourceScaffolding(article[field], article);
    if (!result.contaminated) continue;
    sanitized[field] = result.text;
    contaminatedFields.push(field);
  }
  return {
    article: sanitized,
    changed: contaminatedFields.length > 0,
    contaminatedFields,
  };
}

export function sourceEvidenceIntegrity(article = {}) {
  const result = sanitizeArticleSourceEvidence(article);
  return {
    ok: !result.changed,
    contaminated: result.changed,
    contaminatedFields: result.contaminatedFields,
  };
}

export function firstVerifiedSourceText(article = {}) {
  for (const field of SOURCE_EXCERPT_FIELDS) {
    const result = stripGeneratedSourceScaffolding(article[field], article);
    if (result.text) return result.text;
  }
  return '';
}
