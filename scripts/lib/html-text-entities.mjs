const NAMED_ENTITIES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  hellip: '…',
  rsquo: '’',
  lsquo: '‘',
  rdquo: '”',
  ldquo: '“',
  ndash: '–',
  mdash: '—',
  laquo: '«',
  raquo: '»',
  copy: '©',
  reg: '®',
  trade: '™',
};

// Feed and page text reaches the gates with WordPress-style entities intact
// ("we&rsquo;re", "blur&hellip;", "&#8230;"), so an ellipsis can hide from a
// plain-text check. One pass avoids re-decoding the output of a decoded
// "&amp;".
export function decodeHtmlEntities(text = '') {
  return String(text || '').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, body) => {
    if (body[0] === '#') {
      const codePoint = body[1] === 'x' || body[1] === 'X'
        ? Number.parseInt(body.slice(2), 16)
        : Number.parseInt(body.slice(1), 10);
      if (!Number.isFinite(codePoint) || codePoint <= 0 || codePoint > 0x10ffff) return entity;
      try {
        return String.fromCodePoint(codePoint);
      } catch {
        return entity;
      }
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? entity;
  });
}
