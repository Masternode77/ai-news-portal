// Deterministic check for extracts that are a run of "related story" teasers
// (sidebar, "more from", "most read" blocks) instead of the article body.
//
// The 2026-10-11 editorial verification found HPCwire extracts whose text was
// fourteen clipped sidebar excerpts ("The MLB trade deadline may have passed,
// but we're still seeing big moves in the...") with no article body at all.
// Those extracts scored 0.98-1.0 on the extraction quality model because the
// fragments are grammatical, carry no boilerplate vocabulary, and each one
// ends in a period. The check below looks at the shape of the extract rather
// than its vocabulary. A teaser-shaped segment is clipped with an ellipsis,
// opens with another story's headline glued onto its lead-in sentence, or is
// a bare headline. The extract is contaminated when at least three clipped
// fragments run back to back, or when at least four teaser-shaped segments
// make up half or more of it and at least one of them is clipped. Without an
// ellipsis a glued headline is indistinguishable from a sub-heading that the
// no-paragraph extraction fallback flattened onto its section, so headline
// shapes only ever add weight to clipped evidence. The verdict is a hard
// extraction block: the item may remain a signal card that links to the
// source, but it never feeds generated copy.
//
// Calibrated on 2026-10-11 against every stored article text: all HPCwire
// extracts of that era are caught; feed bodies whose sub-headings are glued to
// the following paragraph by HTML flattening are not (those segments run past
// the teaser length, and a feed body's lone clipped tail is not counted).

export const RELATED_STORY_CONTAMINATION_REASON = 'related_story_contamination';
export const MIN_TEASER_FRAGMENTS = 4;
export const TEASER_FRAGMENT_RATIO_THRESHOLD = 0.5;
export const MIN_CONSECUTIVE_CLIPPED_FRAGMENTS = 3;
export const HEADLINE_RUN_MIN_TOKENS = 5;
export const HEADLINE_GLUED_MAX_WORDS = 40;
const BARE_HEADLINE_MAX_WORDS = 18;
const HEADLINE_LEAD_IN_MIN_WORDS = 3;
const OWN_HEADLINE_MIN_WORDS = 4;

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

const CLIPPED_TERMINAL = /(?:\[…\]|\[\.{3,}\]|…|\.{3,})["'’”)\]]*$/u;
const SEGMENT_BOUNDARY = /(?<=[.!?…]["'’”)\]]*|\[…\]|\[\.{3,}\])\s+/u;

// Lowercase connectors that headlines keep in lowercase; they neither extend
// nor end a title-case run.
const TITLE_CONNECTORS = new Set([
  'a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'from', 'in', 'into', 'nor', 'of', 'on', 'or',
  'over', 'per', 'the', 'to', 'under', 'up', 'via', 'vs', 'with', '&', 'is', 'are',
]);

function compact(text = '') {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function normalizeForComparison(text = '') {
  return compact(decodeHtmlEntities(text))
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function splitSegments(text = '') {
  return compact(text)
    .split(SEGMENT_BOUNDARY)
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function stripLeadingPunctuation(token = '') {
  return token.replace(/^[("'‘“[]+/u, '');
}

function stripTrailingPunctuation(token = '') {
  return token.replace(/[)"'’”\]:!?.]+$/u, '');
}

function tokenCore(raw = '') {
  return stripTrailingPunctuation(stripLeadingPunctuation(raw).replace(/[,;]+$/u, ''));
}

function isDashToken(token = '') {
  return /^(?:-{1,3}|–|—)$/u.test(token);
}

function isTitleToken(core = '') {
  if (!core) return false;
  if (/^[$€£]?\p{N}/u.test(core)) return true;
  return /^\p{Lu}/u.test(core);
}

function isLowercaseWord(core = '') {
  return /^\p{Ll}/u.test(core);
}

// A title-case run at the start of a segment: "What the First Genesis Mission
// Projects Reveal About DOE's AI Priorities" before "over the past several
// days". Commas, semicolons and dashes end the run so datelines ("NEW YORK and
// SAN DIEGO, Aug. 10, 2026 —") stay short; colons do not, because headlines
// carry them ("JUNIQ: Europe's Quantum Buffet").
function leadingTitleRun(words = []) {
  let titleTokens = 0;
  let consumed = 0;
  let sawLowercase = false;

  for (let index = 0; index < words.length; index += 1) {
    const word = stripLeadingPunctuation(words[index]);
    const core = tokenCore(words[index]);
    const endsRun = /[,;]$/u.test(word);

    if (isDashToken(core)) {
      consumed = index;
      break;
    }
    if (isTitleToken(core)) {
      titleTokens += 1;
      consumed = index + 1;
      if (endsRun) break;
      continue;
    }
    if (TITLE_CONNECTORS.has(core.toLowerCase()) && titleTokens > 0 && !endsRun) {
      consumed = index + 1;
      continue;
    }
    consumed = index;
    sawLowercase = isLowercaseWord(core);
    break;
  }

  // What follows the run decides between a headline glued to a lead-in
  // sentence (lowercase prose follows) and a dateline or a proper-noun list.
  let followedByLowercase = sawLowercase;
  if (!sawLowercase) {
    for (let index = consumed; index < words.length; index += 1) {
      const core = tokenCore(words[index]);
      if (!core || isDashToken(core)) continue;
      if (TITLE_CONNECTORS.has(core.toLowerCase())) continue;
      followedByLowercase = isLowercaseWord(core);
      break;
    }
  }

  return { titleTokens, consumed, followedByLowercase, remainingWords: words.length - consumed };
}

function hasLowercaseProse(words = []) {
  return words.some((raw) => {
    const core = tokenCore(raw);
    return isLowercaseWord(core) && !TITLE_CONNECTORS.has(core.toLowerCase());
  });
}

// The article's own headline (repeated by some templates, or an <h1> that an
// adapter swept into the body) is not another story's teaser: the segment is
// the title, starts with it, or opens with a title-case run the title contains.
function isOwnHeadline(segment = '', headlineRun = '', normalizedTitle = '') {
  if (!normalizedTitle || normalizedTitle.split(' ').length < OWN_HEADLINE_MIN_WORDS) return false;
  const normalized = normalizeForComparison(segment);
  if (normalized === normalizedTitle || normalized.startsWith(`${normalizedTitle} `)) return true;
  const run = normalizeForComparison(headlineRun);
  return run.split(' ').length >= OWN_HEADLINE_MIN_WORDS && normalizedTitle.includes(run);
}

function profileSegment(segment = '', normalizedTitle = '') {
  const words = segment.split(/\s+/u).filter(Boolean);
  const clipped = CLIPPED_TERMINAL.test(segment);
  const run = leadingTitleRun(words);
  const ownHeadline = isOwnHeadline(segment, words.slice(0, run.consumed).join(' '), normalizedTitle);
  const headlineGlued = !ownHeadline
    && words.length <= HEADLINE_GLUED_MAX_WORDS
    && run.titleTokens >= HEADLINE_RUN_MIN_TOKENS
    && run.followedByLowercase
    && run.remainingWords >= HEADLINE_LEAD_IN_MIN_WORDS;
  const bareHeadline = !ownHeadline
    && !clipped
    && words.length >= HEADLINE_RUN_MIN_TOKENS
    && words.length <= BARE_HEADLINE_MAX_WORDS
    && run.titleTokens >= HEADLINE_RUN_MIN_TOKENS
    && !hasLowercaseProse(words);

  return {
    text: segment,
    word_count: words.length,
    clipped,
    headline_glued: headlineGlued,
    bare_headline: bareHeadline,
    teaser: clipped || headlineGlued || bareHeadline,
  };
}

function longestRun(profiles = [], predicate) {
  let longest = 0;
  let current = 0;
  for (const profile of profiles) {
    current = predicate(profile) ? current + 1 : 0;
    if (current > longest) longest = current;
  }
  return longest;
}

function ratio(numerator, denominator) {
  if (!denominator) return 0;
  return Number((numerator / denominator).toFixed(2));
}

export function detectRelatedStoryContamination({ title = '', text = '' } = {}) {
  const decoded = compact(decodeHtmlEntities(text));
  const normalizedTitle = normalizeForComparison(title);
  const profiles = splitSegments(decoded).map((segment) => profileSegment(segment, normalizedTitle));
  // A feed body legitimately ends in an ellipsis. When that tail is the only
  // clipped segment it says nothing about the extract's shape and is not
  // counted; a tail that closes a run of clipped teasers is one of them.
  const tail = profiles[profiles.length - 1];
  const feedTail = Boolean(tail?.clipped) && profiles.every((profile) => profile === tail || !profile.clipped);
  if (feedTail) {
    profiles[profiles.length - 1] = { ...tail, clipped: false, headline_glued: false, bare_headline: false, teaser: false, feed_tail: true };
  }
  const teasers = profiles.filter((profile) => profile.teaser);
  const clipped = profiles.filter((profile) => profile.clipped);
  const headlineGlued = profiles.filter((profile) => profile.headline_glued);
  const bareHeadlines = profiles.filter((profile) => profile.bare_headline);
  const teaserChars = teasers.reduce((total, profile) => total + profile.text.length, 0);
  const teaserRatio = ratio(teasers.length, profiles.length);
  const consecutiveClipped = longestRun(profiles, (profile) => profile.clipped);
  const detected = consecutiveClipped >= MIN_CONSECUTIVE_CLIPPED_FRAGMENTS
    || (clipped.length > 0 && teasers.length >= MIN_TEASER_FRAGMENTS && teaserRatio >= TEASER_FRAGMENT_RATIO_THRESHOLD);

  return {
    detected,
    reason: detected ? RELATED_STORY_CONTAMINATION_REASON : null,
    score: teaserRatio,
    segment_count: profiles.length,
    teaser_fragment_count: teasers.length,
    teaser_fragment_ratio: teaserRatio,
    teaser_char_share: ratio(teaserChars, decoded.length),
    clipped_fragment_count: clipped.length,
    consecutive_clipped_fragments: consecutiveClipped,
    headline_glued_count: headlineGlued.length,
    bare_headline_count: bareHeadlines.length,
    sample_fragments: teasers.slice(0, 3).map((profile) => profile.text.slice(0, 160)),
  };
}

export function hasRelatedStoryContamination(options = {}) {
  return detectRelatedStoryContamination(options).detected;
}
