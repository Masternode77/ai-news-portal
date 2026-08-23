// Shared fixture for The Current engine tests and local fixture tooling.
const SOURCE_TEXT = [
  'Northline Power said the Dakota campus will draw 200 MW from the regional grid once the substation is finished.',
  'The developer told Grid Journal the project carries a 3 billion dollar budget and an energization date in late 2027.',
  'Utility filings show the interconnection queue position was granted after a two-year wait, and the first 40 MW phase is already contracted to a cloud tenant.',
  'Northline also said liquid cooling will be required for the second phase because rack densities keep climbing.',
].join(' ');

const CLOSING_HEADING = 'Signals That Settle the Dakota Bet';
const COUNTER_HEADING = 'The Case for the Utility Delivering';

export { SOURCE_TEXT, CLOSING_HEADING, COUNTER_HEADING };

export function fixtureArticle(overrides = {}) {
  return {
    id: 'wire-001',
    title: 'Northline Power lands 200 MW grid deal for Dakota AI campus',
    source: 'Grid Journal',
    sourceUrl: 'https://example.com/northline-dakota',
    publishedAt: new Date(Date.now() - 3 * 3600 * 1000).toISOString(),
    infrastructure_relevance_score: 0.92,
    expert_insight_complete: true,
    expert_insight: {
      concrete_facts: [
        'Northline Power secured 200 MW for the Dakota campus',
        'Project budget is 3 billion dollars',
        'Energization date targeted for late 2027',
        'First 40 MW phase contracted to a cloud tenant',
        'Second phase requires liquid cooling',
      ],
      named_companies: ['Northline Power'],
      infrastructure_layer: 'power',
      bottleneck_type: 'grid interconnection',
      who_gains_leverage: 'utilities with spare interconnection capacity',
      who_takes_execution_risk: 'the developer and its anchor tenant',
      timing_dependency: 'substation completion before late 2027',
      counterargument: 'the queue position may slip if utility work is delayed',
      next_observable_signal: 'substation construction milestones',
    },
    cleaned_source_text: SOURCE_TEXT,
    articleText: SOURCE_TEXT,
    contentText: SOURCE_TEXT,
    primary_category: 'Power / Grid / Energy',
    tags: ['power', 'data centers'],
    generatedImage: '/generated/articles/wire-001/hero.webp',
    ...overrides,
  };
}

export function essayBody() {
  const sections = [
    ['The Grid Deal That Actually Matters', [
      'Northline Power just did the one thing in this cycle that separates a real AI campus from a rendering: it secured delivery. Grid Journal reports the Dakota site will draw 200 MW once its substation is complete, and I read that substation date as the only schedule line worth underwriting. Everything else in the announcement is intent.',
      'I hold a standing view that power, not silicon, sets the clock for capacity buildouts. This deal supports it. The developer waited two years in the interconnection queue before the utility granted a position, according to the filings. Two years. No accelerator roadmap moves that kind of constraint, and no procurement team can spend around it.',
      'So my thesis is simple. The Dakota project is now a utility execution story, and the operator holding the anchor lease has quietly bought schedule risk priced as energy risk.',
    ]],
    ['What Changed This Week', [
      'The reported deal converts a speculative site into a contracted delivery obligation. Grid Journal puts the budget at 3 billion dollars, with energization targeted for late 2027. The first 40 MW phase is already contracted to a cloud tenant, which tells me the developer needed anchor economics before utility milestones existed.',
      'That sequencing choice matters more than the headline capacity number. An anchor tenant signing before energization is trading price for queue position. The tenant gets committed delivery ahead of rivals; the developer gets financing cover for substation work it does not fully control.',
    ]],
    ['Who Carries The Exposure', [
      'The utility carries the political exposure, and the developer carries the construction milestone risk, but the cloud tenant carries the quiet one: opportunity cost. Committing workloads against a substation completion date means the tenant has made a timing bet with its own customers, and inference demand does not politely wait for commissioning.',
      'Investors reading this as a straightforward capacity expansion are underpricing the dependency chain. Budget overruns on grid work land in lease escalators eventually. The leverage sits with whoever controls the interconnection, and here that is the utility, full stop.',
      'The capital stack tells the same story from another direction. A developer that needed anchor economics before breaking ground is a developer whose financing costs move with tenant credit, not with power prices. If the tenant wobbles, the project cost of capital reprices overnight, and the utility keeps its schedule either way. That asymmetry is the trade every anchor tenant in this market is quietly accepting, and most of them are not pricing the exposure into their capacity planning.',
    ]],
    [COUNTER_HEADING, [
      'The honest case against my read: queue positions granted after long waits tend to be durable, and a contracted 40 MW first phase suggests the utility has already done the engineering study work that usually causes slippage. If the substation hits its milestones, the developer looks prescient and the anchor tenant gets cheap, early capacity while rivals are still negotiating.',
      'There is also a scenario where regional load growth stalls and the utility accelerates the work to lock in a rate-base project. In that world my caution costs readers a good entry, not a bad one.',
    ]],
    ['The Cooling Wrinkle', [
      'One line in the coverage deserves more attention than it got: the second phase requires liquid cooling because rack density keeps climbing. Retrofitting cooling assumptions mid-project is exactly the kind of underpriced operational risk I keep flagging. The capital plan that pencils at air-cooled density rarely survives contact with a liquid-cooled bill of materials.',
      'Watch whether the developer discloses a separate cooling budget. Silence on that line item usually means the allocation fight is still happening internally.',
      'There is a procurement angle here too. Liquid cooling shifts spend from the utility side of the ledger to the facility side, and it moves delivery risk onto supplier lead times for cold plates, manifolds, and coolant distribution units. Operators who locked supplier allocation early will treat the density transition as a milestone; everyone else will treat it as an exposure. The cost difference between those two positions compounds with every rack the campus lands, and it shows up in the operating budget long before it shows up in any press release.',
    ]],
    [CLOSING_HEADING, [
      'Substation construction milestones over the next two quarters, because the energization date lives or dies there. Any utility rate filing that references the campus load, because that is where the true cost allocation shows up. And the identity of the second-phase tenant, because a named commitment would confirm the demand side of my thesis while an unnamed one keeps it a supply-side story.',
    ]],
  ];
  return sections
    .map(([heading, paragraphs]) => [heading, ...paragraphs].join('\n\n'))
    .join('\n\n');
}

export const STANCE_JSON_INTERNAL = JSON.stringify({
  thesis: 'The Dakota deal is a utility execution story, and its anchor tenant has bought schedule risk priced as energy risk.',
  angle: 'Anchor leases signed before energization trade price for queue position.',
  standing_position_ids: ['power-binding-constraint', 'announced-vs-energized'],
  counterargument: 'Granted queue positions after long waits tend to be durable.',
  watch_items: ['substation milestones', 'utility rate filings', 'second-phase tenant identity'],
  working_headlines: [
    'The 200 MW Deal Is A Utility Story Now',
    'Dakota Shows Where AI Schedule Risk Really Lives',
    'Anchor Tenants Are Buying Queue Position, Not Power',
  ],
});
export const STANCE_JSON = STANCE_JSON_INTERNAL;

export function essayJson() {
  return JSON.stringify({
    headline: 'The Dakota Grid Deal Is A Utility Execution Story Now',
    deck: 'Northline Power secured 200 MW for its Dakota AI campus, and I think the anchor tenant just bought schedule risk that is priced as energy risk.',
    body: essayBody(),
  });
}
