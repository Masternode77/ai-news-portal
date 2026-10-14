const CLOSED_QUOTE = /“([^“”\n]{1,400})”|"([^"\n]{1,400})"/gu;
const OMISSION = /…|\.{3,}/gu;
const ATTRIBUTION = /\b(?:said|says|wrote|writes|reported|reports|noted|notes|added|adds)[,:]?\s*$/iu;

// Analysis only: preserve the source/reader copy and all other guards. A short
// attributed quotation inside a substantial body can contain editorial elisions.
// An unfinished quote, lone clipped tail, headline cards, or incomplete words
// are not exempted. The callback checks the existing clipped-word rules.
export function maskQuotedElisions(text = '', fragmentIsComplete = () => false) {
  const input = String(text || '');
  const surrounding = input.replace(CLOSED_QUOTE, '');
  if (surrounding.length < 500) return input;
  return input.replace(CLOSED_QUOTE, (quote, curly, straight, offset) => {
    const body = curly ?? straight;
    if (!/(?:…|\.{3,})/u.test(body)) return quote;
    if (!ATTRIBUTION.test(input.slice(Math.max(0, offset - 80), offset))) return quote;
    const fragments = body.split(OMISSION).map(part => part.trim()).filter(Boolean);
    if (fragments.length < 2) return quote;
    if (!fragments.every(fragment => {
      const words = fragment.match(/[\p{L}\p{N}]+(?:['’][\p{L}]+)*/gu) || [];
      const titleWords = words.filter(word => /^\p{Lu}/u.test(word)).length;
      return words.length >= 2 && words.length <= 12 && titleWords < 3
        && !/[.!?]/u.test(fragment) && fragmentIsComplete(fragment);
    })) return quote;
    return quote.replace(OMISSION, ' — ');
  });
}
