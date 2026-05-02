export const EDITORIAL_HUMANIZER_MODE = 'editorial-humanizer-v1';

export const EDITORIAL_HUMANIZER_PROMPT = [
  'Rewrite AI-generated industry coverage into a natural newsroom voice.',
  'Sound like a sharp editor at a respected business or technology publication: clear, grounded, specific, and reader-first.',
  'Preserve facts, dates, source attribution, and uncertainty. Do not invent numbers, quotes, or motives.',
  'Avoid template phrases such as "strategic significance", "this signal matters", "operators should read this through", and "what the market may be missing".',
  'Open with what changed, explain why a busy reader should care, name the practical constraint or second-order effect, then end with what to watch next.',
  'Put a clear hook in the headline or opening paragraph so the reader immediately understands why this is worth clicking.',
  'Provide a three-line executive summary for busy readers: what changed, why it matters, and what to watch.',
  'Use varied sentence length, active verbs, and concrete nouns. Do not mention humanization or AI-detection in reader-facing copy.',
].join(' ');

export function humanizedFallbackSections(article, signal) {
  const source = article.source || 'The source';
  const summary = article.contentText || article.articleText || article.summary || article.snippet || article.title;
  const category = article.category || 'AI infrastructure';
  const title = article.title || 'This development';
  const isVibeCoding = /vibe coding|software engineer|coding/i.test(`${title} ${summary}`);

  if (isVibeCoding) {
    return {
      thesis: `${title} is less a verdict on software jobs than a reminder that AI-assisted coding still needs engineering judgment.`,
      whatHappened: `${source} reported on the spread of vibe coding, where non-programmers and developers use generative AI to turn plain-language prompts into working software.`,
      whyThisMatters: `The shift lowers the barrier to building small tools, but it also pushes more responsibility onto the people who review, secure, and maintain the code after the first demo works.`,
      marketMissing: signal,
      investors: `For investors, the useful question is whether companies can turn faster prototyping into durable products without creating hidden maintenance, security, or compliance debt.`,
      operators: `For operators, AI coding tools may speed internal workflow fixes, but they do not remove the need for ownership, testing, and clear accountability when software touches real infrastructure.`,
      hyperscalers: `For hyperscalers and cloud providers, the opportunity is demand for better developer platforms, managed guardrails, and compute that supports heavier AI-assisted engineering workflows.`,
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
    thesis: `${title} matters most for how quickly ${category.toLowerCase()} teams can turn demand into reliable capacity.`,
    whatHappened: `${source} reported that ${summary}`,
    whyThisMatters: `The important question is not only what was announced, but whether the people building, financing, and operating the infrastructure can execute on schedule.`,
    marketMissing: signal,
    investors: `For investors, the useful read-through is whether this improves pricing power, secures scarce capacity, or exposes execution risk that is still being discounted.`,
    operators: `For operators, the story comes down to procurement timing, facility readiness, power access, and whether adjacent constraints slow deployment.`,
    hyperscalers: `For hyperscalers and cloud providers, watch whether this changes build sequencing, partner dependence, or the cost of scaling clusters across regions.`,
    watchNext: `Watch customer commitments, infrastructure readiness, and any signs that power, cooling, silicon supply, or permitting becomes the real bottleneck.`,
    executiveSummary: [
      `${source} reported a development that could affect ${category.toLowerCase()} planning.`,
      `The practical issue is whether demand can be converted into reliable capacity on schedule.`,
      `Watch execution details, customer commitments, and any bottlenecks around power, cooling, silicon, or permitting.`,
    ],
    summary,
    category,
  };
}
