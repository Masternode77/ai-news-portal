import { sourceSummaryRatio } from './source-summary-ratio.mjs';

const HEADING_SETS = [
  ['The Constraint', 'Why It Matters Now', 'Who Has Leverage', 'The Risk Boundary', 'What This Does Not Prove', 'What To Watch', 'Bottom Line'],
  ['The Read', 'The Operating Layer', 'The Buyer Question', 'The Exposed Assumption', 'The Limitation', 'Signals To Watch', 'Bottom Line'],
  ['The Change', 'Why It Moves Planning', 'Where The Pressure Lands', 'What Could Break', 'Where The Claim Stops', 'Next Proof Points', 'Bottom Line'],
  ['The Planning Signal', 'The Infrastructure Read', 'The Stakeholder Map', 'The Bear Case', 'Where The Claim Stops', 'What To Watch', 'Bottom Line'],
  ['The Practical Read', 'The Constraint Stack', 'The Commercial Question', 'The Operator Question', 'What This Does Not Prove', 'The Watchlist', 'Bottom Line'],
  ['The Brief', 'The Decision Point', 'The Capacity Lens', 'The Procurement Lens', 'The Missing Proof', 'What To Watch', 'Bottom Line'],
  ['The Board Read', 'The Operating Question', 'The Buyer Impact', 'The Skeptical Case', 'The Boundary', 'Signals To Watch', 'Bottom Line'],
  ['The Field Note', 'The Deployment Layer', 'Where Buyers Have To Decide', 'Where Risk Moves', 'What Remains Unproven', 'Next Indicators', 'Bottom Line'],
  ['The Market Signal', 'Why It Changes The Map', 'The Leverage Shift', 'The Weak Point', 'What The Record Does Not Show', 'What To Monitor', 'Bottom Line'],
  ['The Technical Read', 'The Implementation Layer', 'The Architecture Choice', 'The Failure Mode', 'The Limitation', 'Proof Points To Watch', 'Bottom Line'],
  ['The Investor Memo', 'Why It Matters To Underwriting', 'The Exposure Map', 'The Downside Case', 'Where The Claim Ends', 'Follow-On Signals', 'Bottom Line'],
  ['The Procurement Note', 'The Contracting Question', 'The Vendor Leverage', 'The Adoption Risk', 'What Buyers Still Need', 'The Watchlist', 'Bottom Line'],
  ['The Policy Read', 'Why It Matters Locally', 'The Stakeholder Pressure', 'The Delay Risk', 'The Evidence Gap', 'What To Watch', 'Bottom Line'],
  ['The Power Read', 'The Constraint Layer', 'Who Controls Timing', 'What Could Slip', 'What Is Still Missing', 'Next Signals', 'Bottom Line'],
  ['The Cloud Read', 'The Platform Layer', 'The Enterprise Decision', 'The Lock-In Risk', 'What This Does Not Prove', 'What To Watch', 'Bottom Line'],
  ['The Silicon Read', 'The Systems Layer', 'The Supply Question', 'The Qualification Risk', 'Where The Claim Stops', 'Next Proof Points', 'Bottom Line'],
  ['The Cooling Read', 'The Site Layer', 'The Operator Decision', 'The Integration Risk', 'The Missing Proof', 'Signals To Watch', 'Bottom Line'],
  ['The Capital Read', 'The Financing Layer', 'The Risk Transfer', 'The Stress Case', 'What The Record Leaves Open', 'What To Monitor', 'Bottom Line'],
  ['The Resilience Read', 'The Reliability Layer', 'The Owner Question', 'The Break Point', 'What Remains Unclear', 'Next Indicators', 'Bottom Line'],
  ['The Launch Read', 'The Decision Layer', 'The Reader Impact', 'The Constraint Check', 'Where The Article Stops', 'What To Watch', 'Bottom Line'],
];

const LEDE_FRAMES = [
  'A useful AI infrastructure story starts with the operating constraint, and this one starts here:',
  'For infrastructure readers, the important part is not the announcement rhythm; it is this reported change:',
  'The item is worth a local read because it puts a specific decision in front of buyers and operators:',
  'This belongs on the Compute Current board for a narrow reason:',
  'The reported change matters only if it alters planning behavior, and the starting point is this:',
  'The cleanest read is to treat the item as a constraint signal, beginning with the source record:',
  'The story is not broad AI momentum; it is a practical infrastructure question rooted in this fact:',
  'The first thing to separate is the source record from the market interpretation:',
  'This is a planning note before it is a market call:',
  'The source gives readers one useful anchor for a larger infrastructure question:',
  'The item deserves attention because it can change a real-world checklist:',
  'The infrastructure angle begins with a concrete reported detail:',
  'The board-level read starts with what the source actually says:',
  'The operator read starts with the piece of the record that can change sequencing:',
  'The investor read starts with the part that can sharpen an underwriting question:',
  'The procurement read starts with a narrow but actionable fact:',
  'The technical read starts with the implementation detail in the source record:',
  'The policy and siting read starts with the constraint the source puts in view:',
  'The market-map read starts with the actor and the decision point:',
  'The cautious read starts with what can be said without stretching the source:',
];

function compact(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function sentence(value = '') {
  const text = compact(value);
  if (!text) return '';
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

function sourceSentences(article = {}) {
  return compact(article.cleaned_source_text || article.source_evidence_text || article.rawText || article.summary || article.snippet || '')
    .split(/(?<=[.!?])\s+/)
    .map(compact)
    .filter((line) => line.length >= 45 && line.length <= 240)
    .filter((line) => !/copyright|subscribe|newsletter|all rights reserved|click here|advertisement/i.test(line))
    .filter((line) => !/The signal changes who controls|Commercially,|Operationally,|Compute Current readers|tracked by Compute Current|relevant actors|puts power under|lens for infrastructure readers|reported item can translate into|readers should test whether/i.test(line))
    .slice(0, 5);
}

function actor(article = {}) {
  const source = compact(article.source || '');
  const title = compact(article.title || '');
  const beforeColon = title.split(':')[0];
  if (beforeColon && beforeColon.length < 48 && !/^the\b/i.test(beforeColon)) return beforeColon;
  return source || 'the company';
}

function paragraph(...parts) {
  return parts.map(sentence).filter(Boolean).join(' ');
}

function wordCount(text = '') {
  return compact(text).split(/\s+/).filter(Boolean).length;
}

function routeLength(route = '') {
  if (route === 'Core Longform Blog') return { target: 1080, minParagraphs: 14 };
  if (route === 'Standard Blog') return { target: 820, minParagraphs: 10 };
  if (/Cloud Product Read|Enterprise Platform Note|Expert Brief/i.test(route)) return { target: 620, minParagraphs: 8 };
  return { target: 210, minParagraphs: 3 };
}

function analysisLanguage(context = {}) {
  const { angle, article } = context;
  const who = angle.stakeholders || ['operators', 'buyers'];
  return {
    actor: actor(article),
    primary: who[0] || 'operators',
    secondary: who[1] || 'buyers',
    constraint: angle.constraint,
    route: angle.route,
  };
}

export function draftHumanAnalystArticleV3(article = {}, angle = {}, options = {}) {
  const index = Number(options.index || 0);
  const facts = sourceSentences(article);
  const firstFact = (facts[0] || compact(article.summary || article.snippet || article.title))
    .replace(/^[A-Z][A-Za-z &]+ reported:\s*/i, '');
  const secondFact = facts[1] || compact(article.title);
  const headings = HEADING_SETS[index % HEADING_SETS.length];
  const ledeFrame = LEDE_FRAMES[index % LEDE_FRAMES.length];
  const terms = analysisLanguage({ article, angle });
  const route = angle.route || 'Standard Blog';
  const length = routeLength(route);
  const limitationHeading = angle.source_scope_policy?.requires_what_this_does_not_prove
    ? 'What This Does Not Prove'
    : headings[4];
  const limitation = angle.source_scope_policy?.requires_what_this_does_not_prove
    ? 'What this does not prove is equally important: it is not proof of new cloud capacity, data center capacity, power delivery, site readiness, supplier allocation, financing risk, customer commitments, capex, facility construction, permitting, or siting progress.'
    : 'The limitation is that a single article can clarify the decision, but it rarely proves the whole operating outcome. Capacity, cost, delivery, procurement, and reliability claims still need follow-on proof before they become planning assumptions.';

  const blocks = [
    paragraph(
      `${ledeFrame} ${firstFact}`,
      `The practical question for Compute Current readers is whether this changes the constraint stack around ${terms.constraint}, or merely adds another reported item to monitor.`
    ),
    paragraph(
      `The thesis is straightforward: ${angle.thesis}`,
      `That makes the item useful for ${terms.primary} and ${terms.secondary}, but only if the next proof points show timing, cost, capacity, delivery, or operating risk.`
    ),
    headings[0],
    paragraph(
      secondFact,
      `Read through an infrastructure lens, the update matters less as a standalone announcement than as a test of who controls the next decision: the buyer, the operator, the supplier, the utility, or the platform owner.`
    ),
    paragraph(
      `For ${terms.primary}, the near-term value is a sharper planning checklist.`,
      `The important questions are whether procurement timing changes, whether a deployment path becomes less risky, and whether the reported facts alter capacity, resilience, or integration assumptions.`
    ),
    headings[1],
    paragraph(
      `The timing matters because AI infrastructure decisions now stack on top of one another.`,
      `A change in ${terms.constraint} can affect budget sequencing, contract language, migration order, grid planning, cooling design, system qualification, or enterprise architecture reviews.`
    ),
    paragraph(
      `The useful read is not that every stakeholder should move immediately.`,
      `It is that the item gives teams a reason to update their watchlist and ask for better proof before committing capital, capacity, or operating headcount.`
    ),
    headings[2],
    paragraph(
      `${terms.actor} benefits if the reported move makes its path easier to adopt, cheaper to validate, or harder for alternatives to displace.`,
      `Buyers benefit only if that advantage shows up in delivery calendars, service levels, hardware availability, power access, or support obligations they can actually contract around.`
    ),
    paragraph(
      `The exposed side is the team that treats the reported item as proof instead of a signal.`,
      `That is where enterprise architecture groups, capacity planners, investors, and operators can overpay for certainty the record has not yet earned.`
    ),
    headings[3],
    paragraph(
      `The risk boundary is mostly about translation.`,
      `A credible update can still fail to translate into production behavior if integration work is heavier than expected, if support coverage is narrow, if customers wait, or if the physical infrastructure layer cannot keep pace.`
    ),
    paragraph(
      `That is why the next read should focus on operating proof rather than announcement volume.`,
      `Contracted demand, deployment performance, available supply, utility milestones, and buyer adoption are stronger proof points than polished positioning.`
    ),
    limitationHeading,
    paragraph(limitation),
    paragraph(
      `A disciplined reading keeps the item in its proper lane.`,
      `It can inform product, platform, procurement, investor, or operator work without pretending to settle questions the available record does not answer.`
    ),
    headings[5],
    paragraph(
      `Watch for follow-on disclosures that turn the claim into an operating fact.`,
      `The strongest signals would be customer adoption, delivery dates, capacity commitments, power or site milestones, pricing behavior, or independent technical validation.`
    ),
    paragraph(
      `Also watch whether competitors respond with comparable terms, capacity, or product support.`,
      `A fast response would suggest the issue is becoming a market requirement; silence would keep it closer to a company-specific signal.`
    ),
    headings[6],
    paragraph(
      `${angle.bottom_line || `Bottom line: this is worth tracking because ${terms.constraint} is now part of the AI infrastructure decision, but the public record still needs to harden before it becomes a broad market call.`}`
    ),
  ];

  const expansions = [
    paragraph(
      `The decision point for readers is practical rather than abstract`,
      `If this changes a budget, operating plan, cloud architecture, supplier conversation, or site-risk model, it deserves local attention; if it does not, it belongs on the watchlist until stronger proof arrives`
    ),
    paragraph(
      `The second-order effect is procurement discipline`,
      `Teams should separate what is available to buy, what is available to operate, and what is merely becoming easier to discuss with vendors or counterparties`
    ),
    paragraph(
      `The investor read is similarly bounded`,
      `A signal can support a sharper underwriting question without proving demand durability, margin expansion, grid access, or customer concentration risk`
    ),
    paragraph(
      `For operators, the practical work is sequencing`,
      `The item should change priority only if it affects deployment order, resilience planning, capacity reservation, site due diligence, or support coverage`
    ),
    paragraph(
      `For cloud and enterprise teams, the strongest outcome would be fewer ambiguous handoffs`,
      `A clearer owner for migration, security review, support, or workload placement is often more valuable than another broad claim about AI demand`
    ),
    paragraph(
      `That is the board-level reason to keep the item visible`,
      `It links technical feasibility, commercial leverage, and operating risk in a way that can change what gets funded, delayed, or escalated`
    ),
    paragraph(
      `The procurement lens is narrower but just as important`,
      `Buyers should ask what changes in contract terms, delivery accountability, interoperability, power exposure, or lifecycle cost before treating the signal as actionable`
    ),
    paragraph(
      `The capacity lens should stay conservative`,
      `A local article can flag pressure on the constraint stack without assuming new supply, available capacity, or completed infrastructure that the record has not established`
    ),
    paragraph(
      `The operating lens is where weak claims usually break`,
      `If the update cannot survive questions about uptime, support ownership, deployment labor, grid access, cooling envelope, or system qualification, it remains a watchlist item`
    ),
    paragraph(
      `The competitive lens is the last check`,
      `If rival suppliers, developers, utilities, or cloud platforms respond quickly, the item may point to a broader market shift; if not, it is still a company-specific planning signal`
    ),
    paragraph(
      `The launch-readiness question is whether the item helps a real reader decide what to inspect next`,
      `That standard keeps the article useful without converting a narrow report into a claim about the whole AI buildout`
    ),
  ];
  let expansionIndex = 0;
  while (wordCount(blocks.join('\n\n')) < length.target && expansionIndex < expansions.length) {
    blocks.splice(blocks.length - 2, 0, expansions[expansionIndex]);
    expansionIndex += 1;
  }

  const articleBody = blocks.join('\n\n');
  return {
    article_body_markdown: articleBody,
    source_summary_ratio: sourceSummaryRatio(articleBody, compact(article.cleaned_source_text || article.source_evidence_text || '')).source_summary_ratio,
    headings,
  };
}
