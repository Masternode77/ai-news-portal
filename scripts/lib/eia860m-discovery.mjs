// EIA lists every month of the current year on the EIA-860M landing page
// before the corresponding workbook exists, and a request for a missing
// workbook is redirected (HTTP 200) to an HTML section page. Discovery
// therefore has to prove that a candidate is a real spreadsheet before
// treating it as the newest edition, and it has to tell that placeholder
// redirect apart from a malformed response at a real workbook URL.
const MONTHS = ['january','february','march','april','may','june','july','august','september','october','november','december'];
const ZIP_SIGNATURE = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
export const EIA_ORIGIN = 'https://www.eia.gov';

// Every recognised monthly edition on the landing page, newest first. An
// empty list means the page did not look like the EIA-860M landing page at
// all (error page, challenge page, markup change), which callers must treat
// as a discovery failure rather than as "nothing newer".
export function listedEditions(html) {
  const seen = new Set();
  const editions = [];
  for (const match of String(html).matchAll(/href=["']([^"']*xls\/([a-z]+)_generator(\d{4})\.xlsx)["']/gi)) {
    const monthIndex = MONTHS.indexOf(match[2].toLowerCase());
    if (monthIndex < 0 || seen.has(match[1])) continue;
    seen.add(match[1]);
    editions.push({ path: match[1], date: `${match[3]}-${String(monthIndex + 1).padStart(2, '0')}` });
  }
  return editions.sort((a, b) => b.date.localeCompare(a.date));
}

export function workbookCandidates(html, { now = new Date(), previousAsOf = '' } = {}) {
  const currentMonth = now.toISOString().slice(0, 7);
  return listedEditions(html).filter((edition) => edition.date < currentMonth && edition.date > previousAsOf);
}

// EIA answers a request for a workbook that does not exist yet with a
// successful redirect to one of these section pages. Nothing else counts as
// "not published yet".
export const PLACEHOLDER_PATHS = new Set(['/electricity/', '/electricity/data/eia860m/']);

// 'workbook'    same-origin .xlsx URL, successful, non-HTML content type, ZIP signature
// 'unpublished' successful redirect to a known EIA placeholder page
// 'untrusted'   the final URL left the EIA origin
// 'invalid'     anything else: error status, unexpected redirect target,
//               HTML or non-ZIP body at a workbook URL
export function classifyWorkbookResponse({ ok = false, finalUrl = '', contentType = '', head = Buffer.alloc(0) } = {}, { origin = EIA_ORIGIN } = {}) {
  let url;
  try { url = new URL(finalUrl); } catch { return 'invalid'; }
  if (url.origin !== origin) return 'untrusted';
  if (!ok) return 'invalid';
  const pathname = url.pathname.toLowerCase();
  if (!pathname.endsWith('.xlsx')) {
    return PLACEHOLDER_PATHS.has(pathname.endsWith('/') ? pathname : `${pathname}/`) ? 'unpublished' : 'invalid';
  }
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
