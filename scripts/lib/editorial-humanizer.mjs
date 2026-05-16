export const EDITORIAL_HUMANIZER_MODE = 'editorial-humanizer-v1';
export const HUMANIZED_ARTICLE_MIN_CHARS = 1000;

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
  /\bInvestors will care whether\b/gi,
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
  /\bCloud buyers will watch whether\b/gi,
  /^\s*Why it matters\s*$/gim,
  /^\s*Pressure points\s*$/gim,
  /^\s*Market implications\s*$/gim,
  /^\s*What to watch\s*$/gim,
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
  [/\bInvestors will care whether\b/gi, 'The financial question is whether'],
  [/\bOperators should read this through\b/gi, 'Operators will read this through'],
  [/\bFor operators, the story comes down to\b/gi, 'For operators, the pressure sits in'],
  [/\bHyperscalers should focus on whether\b/gi, 'Hyperscalers will be watching whether'],
  [/\bFor hyperscalers and cloud providers, watch whether\b/gi, 'Cloud buyers will watch whether'],
  [/\bCloud buyers will watch whether\b/gi, 'Cloud buyers will be looking for evidence that'],
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
  [/^\s*Why it matters\s*$/gim, ''],
  [/^\s*Pressure points\s*$/gim, ''],
  [/^\s*Market implications\s*$/gim, ''],
  [/^\s*What to watch\s*$/gim, ''],
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
  'The final article body should be at least 1,000 characters, written as continuous reported analysis with no repeated section headings.',
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
    .replace(/\s+…$/g, '')
    .replace(/…$/g, '')
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
  const cleanedSummary = normalizeEditorialVoice(summary).replace(/[.…]+$/, '');
  if (!cleanedSummary) return '';
  const sentence = cleanedSummary.charAt(0).toUpperCase() + cleanedSummary.slice(1);
  return `${source} reported: ${sentence}.`;
}

function bestAvailableSourceText(article = {}, sections = {}) {
  const candidates = [
    article.articleText,
    article.contentText,
    article.snippet,
    article.summary,
    sections.summary,
    article.title,
  ]
    .map((value) => normalizeEditorialVoice(value || '').replace(/[.…]+$/, ''))
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);

  return candidates[0] || '';
}

function categoryContext(article = {}, text = '') {
  const haystack = `${article.title || ''} ${article.category || ''} ${text}`.toLowerCase();
  if (/(power|grid|utility|interconnection|energy|ppa|transformer|electricity)/.test(haystack)) {
    return {
      constraint: 'The constraint is not only the price of electricity. It is the timing of grid access, the flexibility of large loads, and the ability of data center operators to behave less like passive consumers and more like active participants in the power system.',
      audience: 'For infrastructure teams, that makes power procurement and site selection part of the product roadmap. A campus can have customers, capital, and equipment lined up and still lose time if the grid connection, market rules, or operating model cannot absorb the load profile.',
      watch: 'The next test is whether this remains a narrow market experiment or becomes a normal tool for balancing AI demand with grid reliability.',
    };
  }
  if (/(gpu|chip|semiconductor|hbm|silicon|nvidia|amd|fab|foundry|packaging)/.test(haystack)) {
    return {
      constraint: 'The constraint is not just chip supply. Advanced compute depends on packaging, memory, networking, power delivery, and the ability to land systems inside facilities that can actually run them at high utilization.',
      audience: 'That matters for buyers because the useful capacity is the installed, cooled, powered cluster, not the purchase order. It also matters for suppliers because component shortages can shift bargaining power quickly across the stack.',
      watch: 'The next test is whether delivery schedules, memory availability, and deployment readiness move together or start to diverge.',
    };
  }
  if (/(cooling|thermal|liquid|rack|density|cdu)/.test(haystack)) {
    return {
      constraint: 'The constraint is thermal design. Higher rack density changes the shape of the facility, the maintenance model, and the supplier base behind each deployment.',
      audience: 'Operators that treat cooling as a late-stage engineering detail risk turning demand into stranded capacity. Buyers will care less about headline megawatts and more about which sites can support the next generation of accelerator clusters without long retrofit cycles.',
      watch: 'The next test is whether cooling standards, vendor capacity, and operations teams can scale as quickly as the compute roadmap requires.',
    };
  }
  if (/(funding|financing|capital|debt|bond|ipo|valuation|acquisition|merger|investment)/.test(haystack)) {
    return {
      constraint: 'The constraint is capital discipline. AI infrastructure is attracting money, but the gap between committed capital and operating capacity can still be wide when land, power, equipment, and customers do not line up on the same timetable.',
      audience: 'Investors will look for signs that funding is tied to real capacity, durable contracts, and credible execution rather than a broad enthusiasm for anything attached to AI demand.',
      watch: 'The next test is whether financing terms, customer commitments, and construction milestones keep moving in the same direction.',
    };
  }
  return {
    constraint: 'The constraint is execution. AI infrastructure demand is visible, but turning it into usable capacity requires power, equipment, permitting, supply-chain coordination, and customers that are ready to commit.',
    audience: 'That is why operators, cloud buyers, and investors are watching the operating details more closely than the headline. The winner is usually not the party with the loudest demand signal, but the one that removes bottlenecks soon enough to deliver capacity when customers need it.',
    watch: 'The next test is whether the project details support the ambition in the announcement.',
  };
}

function articleAngle(article = {}, sourceText = '') {
  const title = normalizeEditorialVoice(article.title || 'The report');
  const source = article.source || 'The source';
  const category = article.category || 'AI infrastructure';
  const region = article.region || 'global markets';
  const cleanText = normalizeEditorialVoice(sourceText || article.summary || article.snippet || title);
  return {
    title,
    source,
    category,
    region,
    cleanText,
  };
}

function humanizeAudienceImplications({ investor = '', operator = '', cloud = '' } = {}) {
  const parts = [investor, operator, cloud].map(normalizeEditorialVoice).filter(Boolean);
  if (!parts.length) return '';

  const joined = parts.join(' ');
  const financial = joined.match(/(?:The financial question is whether|Investors will be watching whether)\s+([^.]*)/i)?.[1];
  const operating = joined.match(/(?:For operators, the pressure sits in|Operators will look first at|Operators will read this through)\s+([^.]*)/i)?.[1];
  const buyer = joined.match(/(?:The customer question is whether|Cloud buyers will be looking for evidence that|Cloud buyers will watch whether|Hyperscalers will be watching whether)\s+([^.]*)/i)?.[1];

  if (financial || operating || buyer) {
    return normalizeEditorialVoice([
      financial ? `The financial question is whether ${financial.replace(/[.…]+$/, '')}` : '',
      operating ? `the operating question is ${operating.replace(/[.…]+$/, '')}` : '',
      buyer ? `and the customer question is whether ${buyer.replace(/[.…]+$/, '')}` : '',
    ].filter(Boolean).join(', ') + '.');
  }

  return joined;
}

export function buildHumanizedArticleBody(article = {}, sections = {}) {
  const sourceText = bestAvailableSourceText(article, sections);
  const angle = articleAngle(article, sourceText);
  const source = angle.source;
  const category = (sections.category || article.category || 'AI infrastructure').toLowerCase();
  const context = categoryContext(article, sourceText);
  const lead = sourceLead(source, sourceText);
  const seed = Math.abs(String(article.id || article.title || '').split('').reduce((sum, char) => sum + char.charCodeAt(0), 0));
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

  const implications = humanizeAudienceImplications({ investor, operator, cloud });

  const systemFrame = [
    `The important part is what the report says about ${categoryLabel} as a working system, not just as a demand story. ${context.constraint}`,
    `Read narrowly, this is one more item in the daily flow of infrastructure news. Read against the buildout cycle, it points to a more practical question for ${categoryLabel}: can the operating system around compute keep up with demand? ${context.constraint}`,
    `The story lands in a market where demand is already assumed. The more useful question is whether the supporting layer around ${categoryLabel} is flexible enough to turn that demand into available capacity. ${context.constraint}`,
  ][seed % 3];
  const attentionFrame = [
    `That is the reason the development deserves attention beyond the immediate headline. ${pressure}`,
    `That makes the second-order detail more important than the announcement language. ${pressure}`,
    `The pressure point is timing. ${pressure}`,
  ][seed % 3];
  const timingFrame = [
    `There is also a timing issue. In AI infrastructure, announcements often arrive before the hard parts are visible: interconnection queues, equipment lead times, operating approvals, financing conditions, and the practical work of matching customer demand to physical capacity.`,
    `The market tends to price the demand story first and the delivery work later. That can hide the hardest parts of the buildout: grid queues, procurement windows, permitting, vendor capacity, and the coordination needed to turn a plan into a running site.`,
    `This is where AI infrastructure differs from ordinary software growth. Capacity has to be financed, permitted, powered, cooled, connected, staffed, and then sold into real workloads before the economics are visible.`,
  ][seed % 3];
  const readerFrame = [
    `For readers tracking this market, the useful lens is less about whether demand exists and more about where it can be served without delay. A small operational change can matter if it gives operators more flexibility, improves utilization, or exposes a bottleneck that had been hidden inside a broader growth story.`,
    `For a board focused on AI infrastructure, the item matters because it clarifies where leverage may sit. Sometimes that leverage belongs to chip suppliers or cloud platforms. In other cases it moves to utilities, landlords, financing partners, equipment vendors, or regulators that control the pace of deployment.`,
    `The practical read is that infrastructure advantage is becoming more local and more operational. Two companies can chase the same AI demand and end up with very different outcomes if one has better access to power, more credible delivery dates, or a cleaner path through procurement and permitting.`,
  ][seed % 3];

  const paragraphs = [
    lead,
    systemFrame,
    attentionFrame,
    context.audience,
    implications,
    timingFrame,
    readerFrame,
    watch ? `The next signal to watch is ${watch.charAt(0).toLowerCase()}${watch.slice(1).replace(/[.…]+$/, '')}. ${context.watch}` : context.watch,
  ]
    .map(normalizeEditorialVoice)
    .filter(Boolean);

  let body = paragraphs.join('\n\n');
  if (body.length < HUMANIZED_ARTICLE_MIN_CHARS) {
    body = [
      body,
      `The caveat is that the available source material should not be stretched beyond what it supports. ${source} gives enough to frame the operating question, but not enough to declare winners. That is why the analysis should stay close to the reported facts while still explaining why the item belongs on an AI infrastructure board.`,
    ].join('\n\n');
  }

  return body;
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
      investors: `The financial question is whether faster prototyping becomes durable product velocity or simply moves maintenance, security, and compliance debt further downstream.`,
      operators: `Engineering teams may move faster with AI coding tools, but production systems still need owners, tests, reviews, and clear accountability.`,
      hyperscalers: `Cloud platforms can use the shift to sell better developer tooling, managed guardrails, and compute for heavier AI-assisted engineering workflows.`,
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
    investors: `The financial question is whether the move improves pricing power, secures scarce capacity, or exposes execution risk that is still being discounted.`,
    operators: `Operators will look first at procurement timing, facility readiness, power access, and the constraints that could slow deployment.`,
    hyperscalers: `The customer question is whether this changes build sequencing, partner dependence, or the cost of scaling clusters across regions.`,
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
