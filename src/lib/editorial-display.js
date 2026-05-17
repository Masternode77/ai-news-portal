const TEMPLATE_REPLACEMENTS = [
  [/\bExpert lens:\s*/gi, ''],
  [/\bThe strategic significance is not only the announcement itself but how it changes\b/gi, 'The important part is what this could change for'],
  [/\bThe strategic significance is not only[^.]*\.?/gi, 'The important part is how this could change capacity planning, vendor leverage, and deployment sequencing.'],
  [/\bThe strategic significance is not onl\S*/gi, 'The important part is how this could change capacity planning, vendor leverage, and deployment sequencing.'],
  [/\bThe strategic significance is[^.]*$/gi, 'The important part is how this could change capacity planning, vendor leverage, and deployment sequencing.'],
  [/\bThe strategic significance\S*/gi, 'The important part is how this could change capacity planning, vendor leverage, and deployment sequencing.'],
  [/\bThis signal matters because it changes\b/gi, 'The practical effect is on'],
  [/\bThis signal matters because\b/gi, 'The point is that'],
  [/\bThe important question is not only what was announced, but whether\b/gi, 'The test is whether'],
  [/\bThe important questio\S*/gi, 'The test is whether the execution details hold up.'],
  [/\bOperators should read this through\b/gi, 'Operators will read this through'],
  [/\bFor operators, the story comes down to\b/gi, 'For operators, the pressure sits in'],
  [/\bInvestors should track whether\b/gi, 'Investors will be watching whether'],
  [/\bFor investors, the useful read-through is whether\b/gi, 'Investors will care whether'],
  [/\bHyperscalers should focus on whether\b/gi, 'Hyperscalers will be watching whether'],
  [/\bFor hyperscalers and cloud providers, watch whether\b/gi, 'Cloud buyers will watch whether'],
  [/\bwhat the market may be missing\b/gi, 'the risk still being underpriced'],
  [/\b[A-Za-z ]+ raises a practical capacity question after\b/gi, 'The source-backed read starts with'],
  [/\b[A-Za-z ]+ turns component availability into a delivery test after\b/gi, 'The supply-chain read starts with'],
  [/\b[A-Za-z ]+ puts grid timing back into the operating plan after\b/gi, 'The power-market read starts with'],
  [/\bThe useful follow-up is the next [^.]+ disclosure that confirms timing, site readiness, buyer commitment, or operating impact\.?/gi, 'The watch item should be a source-specific operating metric.'],
  [/\bThe useful follow-up is\b/gi, 'Watch'],
  [/\bstill has to show that the reported change can survive real deployment, financing, or operating constraints\.?/gi, 'still needs source-backed deployment, financing, or operating evidence.'],
  [/\bbelongs on the board only if\b/gi, 'matters to readers when'],
  [/\bread-through\b/gi, 'implication'],
  [/\b(.{8,180}?) matters most for how quickly\b/gi, '$1 is worth watching for how quickly'],
  [/\b(.{8,180}?) is worth watching for how quickly\b/gi, '$1 depends on how quickly'],
  [/\b(.{8,180}?) matters because it shifts\b/gi, '$1 is worth watching because it shifts'],
  [/\b(.{8,180}?) is worth watching because it shifts\b/gi, '$1 could shift'],
  [/\b:\s*what it changes for\b/gi, ': the capacity question for'],
  [/\b:\s*what it changes\S*/gi, ': the capacity question'],
  [/\bLink Gift Expand\b/gi, ''],
  [/\bX LinkedIn Email Link Gift Gift this article\b/gi, ''],
  [/\bContact us:\s*Provide news feedback or report an error Confidential tip\S*/gi, ''],
  [/^\s*Why it matters\s*$/gim, ''],
  [/^\s*Pressure points\s*$/gim, ''],
  [/^\s*Market implications\s*$/gim, ''],
  [/^\s*What to watch\s*$/gim, ''],
  [/\bnetapp\b/g, 'NetApp'],
  [/\bred hat\b/gi, 'Red Hat'],
  [/\bopenshift\b/gi, 'OpenShift'],
  [/\bproxmox\b/gi, 'Proxmox'],
  [/\bkvm\b/g, 'KVM'],
  [/\bhyper-v\b/gi, 'Hyper-V'],
  [/\bnutanix\b/gi, 'Nutanix'],
  [/\bxcp-ng\b/gi, 'XCP-ng'],
  [/\bservethehome\b/gi, 'ServeTheHome'],
];

export function cleanEditorialText(text = '') {
  let cleaned = String(text || '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#8217;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
  for (const [pattern, replacement] of TEMPLATE_REPLACEMENTS) {
    cleaned = cleaned.replace(pattern, replacement);
  }
  return cleaned.replace(/\.{2,}/g, '.').replace(/\s+([,.;:!?])/g, '$1').trim();
}

function splitSentences(text = '') {
  return cleanEditorialText(text)
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function normalizeExecutiveSummary(value) {
  if (Array.isArray(value)) {
    return value.map(cleanEditorialText).filter(Boolean).slice(0, 3);
  }

  if (typeof value === 'string') {
    return value
      .split(/\n+|(?:^|\s)[-•]\s+/)
      .map(cleanEditorialText)
      .filter(Boolean)
      .slice(0, 3);
  }

  return [];
}

export function executiveSummaryLines(article = {}) {
  const lens = article.expertLensFull || {};
  const provided = normalizeExecutiveSummary(lens.executiveSummary || article.executiveSummary);
  if (provided.length >= 3) return provided;

  const candidates = [
    lens.thesis,
    lens.whyThisMatters,
    lens.marketMissing,
    lens.watchNext,
    article.summary,
    article.snippet,
    article.articleText,
    article.contentText,
  ]
    .flatMap((value) => splitSentences(value))
    .filter(Boolean);

  return [...provided, ...candidates]
    .filter((line, index, list) => list.findIndex((item) => item.toLowerCase() === line.toLowerCase()) === index)
    .slice(0, 3);
}

export function displayHeadline(article = {}) {
  return cleanEditorialText(article.expertLensFull?.finalHeadline || article.title || '');
}
