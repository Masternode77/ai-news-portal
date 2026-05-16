export const EDITORIAL_HUMANIZER_MODE = 'editorial-humanizer-v1';

export const EDITORIAL_BANNED_PATTERNS = [
  /\bExpert lens:\s*/gi,
  /\bThis signal matters because\b/gi,
  /\bThe strategic significance is not only\b/gi,
  /\bThe strategic significance is not onl\S*/gi,
  /\bThe strategic significance is\b/gi,
  /\bThe strategic significance\S*/gi,
  /\bwhat the market may be missing\b/gi,
  /\bOperators should read this through\b/gi,
  /\bInvestors should track whether\b/gi,
  /\bHyperscalers should focus on whether\b/gi,
  /\bThe important question is not only what was announced\b/gi,
  /\bThe important questio\S*/gi,
  /\bmatters most for how quickly\b/gi,
  /\bis worth watching for how quickly\b/gi,
  /\bdepends on how quickly\b/gi,
  /\bturn demand into reliable capacity\b/gi,
  /\bmatters because it shifts\b/gi,
  /\bis worth watching because it shifts\b/gi,
  /\bwhat it changes for\b/gi,
  /\bwhat it changes\S*/gi,
  /\bFor investors, the useful read-through is\b/gi,
  /\bFor operators, the story comes down to\b/gi,
  /\bFor hyperscalers and cloud providers, watch whether\b/gi,
];

const EDITORIAL_REPLACEMENTS = [
  [/\bExpert lens:\s*/gi, ''],
  [/\bThis signal matters because it changes\b/gi, 'The practical effect is on'],
  [/\bThis signal matters because\b/gi, 'The point is that'],
  [/\bThe strategic significance is not only the announcement itself but how it changes\b/gi, 'The important part is how it could change'],
  [/\bThe strategic significance is not only[^.]*\.?/gi, 'The important part is how this could change capacity planning, vendor leverage, and deployment sequencing.'],
  [/\bThe strategic significance is not onl\S*/gi, 'The important part is how this could change capacity planning, vendor leverage, and deployment sequencing.'],
  [/\bThe strategic significance is[^.]*$/gi, 'The important part is how this could change capacity planning, vendor leverage, and deployment sequencing.'],
  [/\bThe strategic significance\S*/gi, 'The important part is how this could change capacity planning, vendor leverage, and deployment sequencing.'],
  [/\bThe important question is not only what was announced, but whether\b/gi, 'The test is whether'],
  [/\bThe important questio\S*/gi, 'The test is whether the execution details hold up.'],
  [/\bwhat the market may be missing\b/gi, 'the risk still being underpriced'],
  [/\bInvestors should track whether\b/gi, 'Investors will be watching whether'],
  [/\bFor investors, the useful read-through is whether\b/gi, 'Investors will care whether'],
  [/\bOperators should read this through\b/gi, 'Operators will read this through'],
  [/\bFor operators, the story comes down to\b/gi, 'For operators, the pressure sits in'],
  [/\bHyperscalers should focus on whether\b/gi, 'Hyperscalers will be watching whether'],
  [/\bFor hyperscalers and cloud providers, watch whether\b/gi, 'Cloud buyers will watch whether'],
  [/\bread-through\b/gi, 'implication'],
  [/\bstrategic read-through\b/gi, 'market implication'],
  [/\b(.{8,180}?) matters most for how quickly\b/gi, '$1 is worth watching for how quickly'],
  [/\b(.{8,180}?) is worth watching for how quickly\b/gi, '$1 depends on how quickly'],
  [/\b(.{8,180}?) matters because it shifts\b/gi, '$1 is worth watching because it shifts'],
  [/\b(.{8,180}?) is worth watching because it shifts\b/gi, '$1 could shift'],
  [/\b:\s*what it changes for\b/gi, ': the capacity question for'],
  [/\b:\s*what it changes\S*/gi, ': the capacity question'],
  [/\bLink Gift Expand\b/gi, ''],
  [/\bX LinkedIn Email Link Gift Gift this article\b/gi, ''],
  [/\bContact us:\s*Provide news feedback or report an error Confidential tip\S*/gi, ''],
];

export const EDITORIAL_HUMANIZER_PROMPT = [
  'Rewrite AI-generated industry coverage into a natural newsroom voice.',
  'Sound like a sharp editor at a respected business or technology publication: clear, grounded, specific, and reader-first.',
  'Preserve facts, dates, source attribution, and uncertainty. Do not invent numbers, quotes, or motives.',
  'Avoid template phrases such as "strategic significance", "this signal matters", "operators should read this through", and "what the market may be missing".',
  'Do not write like a consulting memo. Avoid repeated "For investors / For operators / For hyperscalers" scaffolding unless the distinction is genuinely useful.',
  'Open with what changed, explain why a busy reader should care, name the practical constraint or second-order effect, then end with what to watch next.',
  'Put a clear hook in the headline or opening paragraph so the reader immediately understands why this is worth clicking.',
  'Provide a three-line executive summary for busy readers: what changed, why it matters, and what to watch.',
  'Use varied sentence length, active verbs, and concrete nouns. Do not mention humanization or AI-detection in reader-facing copy.',
  'The final article body should read as reported analysis, not as a list of generated bullet points.',
].join(' ');

function compactWhitespace(text = '') {
  return String(text || '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#8217;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/,\s*…/g, '…')
    .replace(/…\./g, '…')
    .replace(/\.{2,}/g, '.')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim();
}

export function normalizeEditorialVoice(text = '') {
  let cleaned = compactWhitespace(text);
  for (const [pattern, replacement] of EDITORIAL_REPLACEMENTS) {
    cleaned = cleaned.replace(pattern, replacement);
  }

  return cleaned
    .replace(/\s+\.\s*/g, '. ')
    .replace(/\.{2,}/g, '.')
    .replace(/\s+;/g, ';')
    .replace(/\s+/g, ' ')
    .trim();
}

export function containsTemplateLanguage(text = '') {
  return EDITORIAL_BANNED_PATTERNS.some((pattern) => {
    pattern.lastIndex = 0;
    return pattern.test(text);
  });
}

export function normalizeEditorialParagraphs(text = '') {
  return String(text || '')
    .split(/\n{2,}/)
    .map((paragraph) => normalizeEditorialVoice(paragraph))
    .filter(Boolean)
    .filter((paragraph, index, list) => {
      const key = paragraph.toLowerCase();
      return list.findIndex((item) => item.toLowerCase() === key) === index;
    });
}

function sourceLead(source, summary) {
  const cleanedSummary = normalizeEditorialVoice(summary).replace(/\.$/, '');
  if (!cleanedSummary) return '';
  const sentence = cleanedSummary.charAt(0).toUpperCase() + cleanedSummary.slice(1);
  return `${source} reported: ${sentence}.`;
}

export function buildHumanizedArticleBody(article = {}, sections = {}) {
  const source = article.source || 'The source';
  const summary = sections.summary || article.summary || article.snippet || article.articleText || article.title || '';
  const category = (sections.category || article.category || 'AI infrastructure').toLowerCase();
  const lead = sourceLead(source, summary);
  const categoryLabel = category
    .replace(/hyperscalers\s*&\s*cloud/i, 'cloud infrastructure')
    .replace(/ai infrastructure \(gpu\/neocloud\)/i, 'AI compute infrastructure')
    .replace(/colocation\s*&\s*wholesale/i, 'data center leasing')
    .replace(/market \/ m&a \/ financing/i, 'infrastructure finance')
    .replace(/apac \+ policy\/regulation/i, 'regional policy')
    .replace(/\s*&\s*/g, ' and ');
  const pressure = normalizeEditorialVoice(
    sections.marketMissing ||
      'The harder part is turning demand into capacity without letting power, cooling, supply chain, or permitting delays set the schedule.'
  );
  const investor = normalizeEditorialVoice(sections.investors || '');
  const operator = normalizeEditorialVoice(sections.operators || '');
  const cloud = normalizeEditorialVoice(sections.hyperscalers || '');
  const watch = normalizeEditorialVoice(sections.watchNext || '').replace(/^watch\s+/i, '');

  const implications = [investor, operator, cloud]
    .filter(Boolean)
    .map((line) => line.replace(/\.$/, ''))
    .join('. ');

  const frameSeed = String(article.id || article.title || '').charCodeAt(0) % 3;
  const frame = [
    `For companies exposed to ${categoryLabel}, the useful question is practical. ${pressure}`,
    `That puts the focus back on execution in ${categoryLabel}. ${pressure}`,
    `The headline only matters if the infrastructure follows. ${pressure}`,
  ][frameSeed];

  return [
    lead,
    frame,
    implications ? `${implications}.` : '',
    watch ? `The next useful signal is ${watch.charAt(0).toLowerCase()}${watch.slice(1)}` : '',
  ]
    .map(normalizeEditorialVoice)
    .filter(Boolean)
    .join('\n\n');
}

function fallbackThesis(article = {}, signal = '') {
  const category = article.category || 'AI infrastructure';
  const categoryLabel = category
    .replace(/hyperscalers\s*&\s*cloud/i, 'cloud infrastructure')
    .replace(/ai infrastructure \(gpu\/neocloud\)/i, 'AI compute infrastructure')
    .replace(/colocation\s*&\s*wholesale/i, 'data center leasing')
    .replace(/market \/ m&a \/ financing/i, 'infrastructure finance')
    .replace(/apac \+ policy\/regulation/i, 'regional policy')
    .replace(/\s*&\s*/g, ' and ');
  const lowerSignal = `${article.title || ''} ${article.summary || ''} ${signal}`.toLowerCase();
  if (/(gpu|chip|semiconductor|hbm|silicon|nvidia|amd|arm holdings|netapp|storage|backup|vm)/.test(lowerSignal)) {
    return 'The issue is no longer demand alone; it is whether the surrounding infrastructure is ready.';
  }
  if (/(power|grid|utility|interconnection|energy)/.test(lowerSignal)) {
    return 'The real test is whether power access can keep pace with AI infrastructure demand.';
  }
  if (/(cooling|thermal|liquid|rack)/.test(lowerSignal)) {
    return 'The next constraint is thermal design, not just appetite for more compute.';
  }
  if (/(funding|financing|capital|debt|ipo|valuation|acquisition)/.test(lowerSignal)) {
    return 'Capital is moving toward AI infrastructure, but execution risk still decides who captures the demand.';
  }
  return `The development puts ${categoryLabel.toLowerCase()} execution, not headline demand, at the center of the story.`;
}

export function humanizedFallbackSections(article, signal) {
  const source = article.source || 'The source';
  const summary = normalizeEditorialVoice(
    article.summary || article.snippet || article.contentText || article.articleText || article.title
  );
  const category = article.category || 'AI infrastructure';
  const title = article.title || 'This development';
  const isVibeCoding = /vibe coding|software engineer|coding/i.test(`${title} ${summary}`);

  if (isVibeCoding) {
    return {
      thesis: `${title} is less a verdict on software jobs than a reminder that AI-assisted coding still needs engineering judgment.`,
      whatHappened: `${source} reported on the spread of vibe coding, where non-programmers and developers use generative AI to turn plain-language prompts into working software.`,
      whyThisMatters: `The shift lowers the barrier to building small tools, but it also pushes more responsibility onto the people who review, secure, and maintain the code after the first demo works.`,
      marketMissing: signal,
      investors: `Investors will care whether faster prototyping becomes durable product velocity or simply moves maintenance, security, and compliance debt further downstream.`,
      operators: `Engineering teams may move faster with AI coding tools, but production systems still need owners, tests, reviews, and clear accountability.`,
      hyperscalers: `Cloud platforms have room to sell better developer tooling, managed guardrails, and compute for heavier AI-assisted engineering workflows.`,
      watchNext: `Watch hiring patterns for junior developers, enterprise controls around AI-generated code, and whether teams can measure productivity gains after the novelty wears off.`,
      executiveSummary: [
        `Generative AI is making it easier for non-programmers and developers to get a first version of software running.`,
        `The harder question is who reviews, secures, and maintains that code once it enters a real business.`,
        `Watch whether companies pair faster prototyping with clear ownership, testing, and controls.`,
      ],
      summary,
      category,
    };
  }

  return {
    thesis: fallbackThesis(article, signal),
    whatHappened: sourceLead(source, summary),
    whyThisMatters: `The test is whether the companies building, financing, and operating the infrastructure can move on schedule.`,
    marketMissing: signal,
    investors: `Investors will care whether the move improves pricing power, secures scarce capacity, or exposes execution risk that is still being discounted.`,
    operators: `Operators will look first at procurement timing, facility readiness, power access, and the constraints that could slow deployment.`,
    hyperscalers: `Cloud buyers will watch whether this changes build sequencing, partner dependence, or the cost of scaling clusters across regions.`,
    watchNext: `customer commitments, infrastructure readiness, and signs that power, cooling, silicon supply, or permitting is becoming the real bottleneck.`,
    executiveSummary: [
      `${source} reported a development that could affect ${category.toLowerCase()} planning.`,
      `The practical issue is whether demand can be converted into reliable capacity on schedule.`,
      `Watch execution details, customer commitments, and any bottlenecks around power, cooling, silicon, or permitting.`,
    ],
    summary,
    category,
  };
}
