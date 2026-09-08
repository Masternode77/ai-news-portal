// EIA lists every month of the current year on the EIA-860M landing page
// before the corresponding workbook exists, and a request for a missing
// workbook is redirected (HTTP 200) to an HTML section page. Discovery
// therefore has to prove that a candidate is a real spreadsheet before
// treating it as the newest edition.
const MONTHS = ['january','february','march','april','may','june','july','august','september','october','november','december'];
const ZIP_SIGNATURE = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

export function workbookCandidates(html, { now = new Date(), previousAsOf = '' } = {}) {
  const currentMonth = now.toISOString().slice(0, 7);
  const seen = new Set();
  const candidates = [];
  for (const match of String(html).matchAll(/href=["']([^"']*xls\/([a-z]+)_generator(\d{4})\.xlsx)["']/gi)) {
    const monthIndex = MONTHS.indexOf(match[2].toLowerCase());
    if (monthIndex < 0) continue;
    const date = `${match[3]}-${String(monthIndex + 1).padStart(2, '0')}`;
    if (date >= currentMonth || date <= previousAsOf || seen.has(match[1])) continue;
    seen.add(match[1]);
    candidates.push({ path: match[1], date });
  }
  return candidates.sort((a, b) => b.date.localeCompare(a.date));
}

export function isWorkbookResponse({ ok = false, finalUrl = '', contentType = '', head = Buffer.alloc(0) } = {}) {
  if (!ok) return false;
  let pathname = '';
  try { pathname = new URL(finalUrl).pathname.toLowerCase(); } catch { return false; }
  if (!pathname.endsWith('.xlsx')) return false;
  if (/text\/html/i.test(contentType)) return false;
  return Buffer.from(head).subarray(0, 4).equals(ZIP_SIGNATURE);
}

// Walks candidates newest first and returns the first one that is a real
// workbook, or null when every newer listing is still a placeholder.
export async function selectPublishedWorkbook(candidates, fetchCandidate) {
  for (const candidate of candidates) {
    const result = await fetchCandidate(candidate);
    if (result && isWorkbookResponse(result)) return { candidate, result };
  }
  return null;
}
