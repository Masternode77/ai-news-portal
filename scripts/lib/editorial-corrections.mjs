// Reader-facing correction notes. A record may carry `corrections`, an array
// of { date, summary } entries written when a published body is changed.
// Notes are public copy: they render on the article page and feed the
// NewsArticle `correction` property, so they pass the same copy guards as
// prose. Nothing here rewrites or hides an article.
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// The entries correctionNotes() keeps: an object with a YYYY-MM-DD date and a
// non-blank summary. Anything else never reaches a reader.
export function isRenderedCorrection(entry) {
  return Boolean(entry && typeof entry === 'object'
    && typeof entry.date === 'string' && ISO_DATE.test(entry.date)
    && typeof entry.summary === 'string' && entry.summary.trim());
}

export function correctionNotes(record = {}) {
  const entries = Array.isArray(record?.corrections) ? record.corrections : [];
  return entries
    .filter(isRenderedCorrection)
    .map((entry) => ({
      date: typeof entry.date === 'string' && ISO_DATE.test(entry.date) ? entry.date : '',
      summary: typeof entry.summary === 'string' ? entry.summary.replace(/\s+/g, ' ').trim() : '',
    }))
    .filter((entry) => entry.date && entry.summary)
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function formatCorrectionDate(date = '') {
  if (!ISO_DATE.test(date)) return '';
  return new Date(`${date}T00:00:00.000Z`).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** Plain-text form for schema.org NewsArticle `correction`. */
export function correctionText(record = {}) {
  const notes = correctionNotes(record);
  if (!notes.length) return '';
  return notes.map((note) => `${formatCorrectionDate(note.date)}: ${note.summary}`).join(' ');
}
