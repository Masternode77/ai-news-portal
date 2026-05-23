function compact(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function paragraph(text = '') {
  const cleaned = compact(text);
  return /[.!?]$/.test(cleaned) ? cleaned : `${cleaned}.`;
}

function actorList(evidencePack = {}) {
  const actors = evidencePack.namedActors || [];
  return actors.length ? actors.slice(0, 4).join(', ') : 'operators, capacity planners, infrastructure investors, and enterprise platform teams';
}

function pickFact(facts = [], index = 0, fallback = '') {
  return facts.length ? facts[index % facts.length] : fallback;
}

function buildSectionParagraphs({ heading, article, evidencePack, angle, tone, route, index = 0 }) {
  const layer = evidencePack.affectedInfrastructureLayer || 'AI infrastructure';
  const actors = actorList(evidencePack);
  const facts = evidencePack.facts || [];
  const source = evidencePack.source || article.source || 'the source';
  const watch = evidencePack.watchMetrics || [];
  const title = article.title || 'this item';
  const fact = pickFact(facts, index, title);
  const nextFact = pickFact(facts, index + 1, evidencePack.commercialImplication);

  const common = {
    sourceRead: paragraph(`${source} supplies the reporting base: ${fact.replace(/\.$/, '')}. Compute Current reads that event through ${layer}, where timing, site readiness, and control over scarce inputs matter more than headline volume.`),
    layerRead: paragraph(`In ${layer}, the decisive question is whether capacity availability, deployment timing, operating cost, or ownership of a constrained input has changed.`),
    stakeholderRead: paragraph(`${actors} do not share the same exposure. What looks like an opening for one side can become schedule risk, margin pressure, or procurement friction for another.`),
    commercialRead: paragraph(evidencePack.commercialImplication),
    operatingRead: paragraph(evidencePack.operatingImplication),
    counterRead: paragraph(evidencePack.counterargument),
    watchRead: paragraph(`Track ${watch.join('; ') || evidencePack.whatWouldChangeOurView}. These indicators matter because they translate a public report into the procurement, financing, and operations signals readers can act on.`),
    secondEvidenceRead: paragraph(`${nextFact.replace(/\.$/, '')} gives the article a second anchor, which keeps the analysis tied to observable infrastructure behavior rather than broad market excitement.`),
    bottomLine: paragraph(`${angle.thesis} The article stays in ${route.label || 'blog'} territory while the evidence remains clean, specific, and tied to ${layer}.`),
  };

  if (/Counter|Bear|Break|Risk Boundary|Who Carries|Limitation|Not Prove|Still Missing|Mislead|Volatility|Offset/i.test(heading)) {
    return [common.counterRead, paragraph(`That limit matters. A named project, product, or capital move can still miss schedule, economics, customer adoption, or grid reality; the article keeps those unknowns visible instead of smoothing them away.`)];
  }
  if (/Signals|Metrics/i.test(heading)) {
    return [common.watchRead, paragraph(`If those signals move in the wrong direction, the story should be downgraded from an infrastructure thesis to a watchlist item. If they improve, it can support procurement, capital, or operating decisions.`)];
  }
  if (/Bottom Line/i.test(heading)) {
    return [common.bottomLine];
  }
  if (/Commercial|Capital|Margin|Buyer|Stakeholder|Who Carries/i.test(heading)) {
    return [common.commercialRead, common.stakeholderRead];
  }
  if (/Operational|Operator|Architecture|Platform|Deployment|System|Capacity|Mechanism|Cost|Reliability/i.test(heading)) {
    return [common.operatingRead, common.layerRead, common.secondEvidenceRead].slice(0, index % 2 ? 2 : 3);
  }
  return [common.sourceRead, index % 2 ? common.stakeholderRead : common.secondEvidenceRead];
}

export function writeAnalystDraft({ article = {}, evidencePack = {}, researchBrief = {}, angle = {}, lede = '', outline = {}, tone = '', route = {} } = {}) {
  const sections = [];
  const headings = outline.headings || [];
  sections.push(lede);
  sections.push('Thesis');
  sections.push(paragraph(angle.thesis || researchBrief.why_it_matters));

  for (const [index, heading] of headings.entries()) {
    sections.push(heading);
    sections.push(...buildSectionParagraphs({ heading, article, evidencePack, angle, tone, route, index }));
  }

  return sections.filter(Boolean).join('\n\n');
}
