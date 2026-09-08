// EIA lists every month of the current year on the EIA-860M landing page
// before the corresponding workbook exists, and a request for a missing
// workbook is redirected (HTTP 200) to an HTML section page. Discovery
// therefore has to prove that a candidate is a real spreadsheet before
// treating it as the newest edition, and it has to tell that placeholder
// redirect apart from a malformed response at a real workbook URL.
const MONTHS = ['january','february','march','april','may','june','july','august','september','october','november','december'];
const ZIP_SIGNATURE = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
export const EIA_ORIGIN = 'https://www.eia.gov';

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

// 'workbook'    same-origin .xlsx URL, non-HTML content type, ZIP signature
// 'unpublished' EIA redirected the request to a page that is not a workbook
// 'untrusted'   the final URL left the EIA origin
// 'invalid'     a workbook URL answered with something that is not a workbook
export function classifyWorkbookResponse({ ok = false, finalUrl = '', contentType = '', head = Buffer.alloc(0) } = {}, { origin = EIA_ORIGIN } = {}) {
  let url;
  try { url = new URL(finalUrl); } catch { return 'invalid'; }
  if (url.origin !== origin) return 'untrusted';
  if (!url.pathname.toLowerCase().endsWith('.xlsx')) return 'unpublished';
  if (!ok) return 'invalid';
  if (/text\/html/i.test(contentType)) return 'invalid';
  return Buffer.from(head).subarray(0, 4).equals(ZIP_SIGNATURE) ? 'workbook' : 'invalid';
}

export function isWorkbookResponse(response, options) {
  return classifyWorkbookResponse(response, options) === 'workbook';
}

// Walks candidates newest first. Placeholder redirects are skipped; the
// first real workbook wins; anything else fails closed so the refresh never
// reports success on the strength of a malformed or off-origin response.
export async function selectPublishedWorkbook(candidates, fetchCandidate, options) {
  for (const candidate of candidates) {
    const result = await fetchCandidate(candidate);
    const verdict = classifyWorkbookResponse(result || {}, options);
    if (verdict === 'workbook') return { candidate, result };
    if (verdict === 'untrusted') throw new Error('Untrusted workbook URL');
    if (verdict === 'invalid') throw new Error('Workbook response invalid');
  }
  return null;
}
