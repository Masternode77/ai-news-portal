const sentenceSegmenter = new Intl.Segmenter('en', { granularity: 'sentence' });

function splitSentences(value = '') {
  return [...sentenceSegmenter.segment(String(value || ''))]
    .map(({ segment }) => segment.trim())
    .filter(Boolean);
}

function isStandaloneHeading(value = '') {
  const text = String(value || '').trim().replace(/^#{1,6}\s+/, '');
  if (/[.!?](?:\s|$)/.test(text)) return false;
  if (/[\d$€£]/.test(text) || /\b(?:announced|expects|guaranteed|guarantees|reported|secured|signed|targeted|will)\b/i.test(text)) {
    return false;
  }
  const words = text.match(/[A-Za-z0-9][A-Za-z0-9'&-]*/g) || [];
  if (!words.length || words.length > 12) return false;
  const contentWords = words.filter((word) => !/^(a|an|and|at|for|from|in|is|not|of|on|or|the|to|with)$/i.test(word));
  return contentWords.length > 0 && contentWords.every((word) => /^[A-Z0-9]/.test(word));
}

function extractClaims(body = '', { minLength = 0, skipStandaloneHeadings = true } = {}) {
  return String(body || '')
    .split(/\n\s*\n+/)
    .flatMap((block) => {
      const text = block.trim();
      if (!text || (skipStandaloneHeadings && isStandaloneHeading(text))) return [];
      return splitSentences(text);
    })
    .map((claim) => claim.trim())
    .filter((claim) => claim.length > minLength);
}

function normalizedTerms(value = '') {
  return [...new Set(String(value || '').toLowerCase().split(/\W+/).filter((word) => word.length > 4))];
}

function normalizedNumericMentions(value = '') {
  const mentions = [];
  const pattern = /(\$)?\b(\d+(?:[.,]\d+)*)(?:\s*-?\s*(billions?|millions?|percent|years?|acres?|buildings?|campuses?|facilities?|mw|gw|kw|bn|mn|b|m|%))?(?!\w)/gi;
  const unitAliases = {
    b: 'billion',
    bn: 'billion',
    m: 'million',
    mn: 'million',
    '%': 'percent',
  };
  for (const match of String(value || '').matchAll(pattern)) {
    const number = match[2].replaceAll(',', '');
    const rawUnit = String(match[3] || '').toLowerCase().replace(/s$/, '');
    const unit = unitAliases[rawUnit] || rawUnit;
    mentions.push(`${number}:${match[1] ? '$' : ''}${unit || 'number'}`);
  }
  return [...new Set(mentions)];
}

function introducesNewNumericMention(claim = '', evidence = '') {
  const evidenceMentions = new Set(normalizedNumericMentions(evidence));
  return normalizedNumericMentions(claim).some((mention) => !evidenceMentions.has(mention));
}

function evidenceSentences(evidencePack = {}) {
  return [
    ...splitSentences(evidencePack.evidenceText),
    ...(evidencePack.facts || []),
  ].map((value) => String(value || '').trim()).filter(Boolean);
}

function claimIsSourceGrounded(claim = '', evidence = []) {
  const claimTerms = normalizedTerms(claim);
  if (claimTerms.length < 3) return false;
  return evidence.some((sentence) => {
    const evidenceTerms = new Set(normalizedTerms(sentence));
    const overlap = claimTerms.filter((term) => evidenceTerms.has(term)).length;
    return !introducesNewNumericMention(claim, sentence)
      && overlap >= 3
      && overlap / claimTerms.length >= 0.8;
  });
}

function premiseIsSourceGrounded(premise = '', evidence = '') {
  const premiseTerms = normalizedTerms(premise);
  if (premiseTerms.length < 3) return false;
  const evidenceTerms = normalizedTerms(evidence);
  const overlap = premiseTerms.filter((term) => evidenceTerms.includes(term)).length;
  return overlap / premiseTerms.length >= 0.8
    && !introducesNewNumericMention(premise, evidence);
}

function canonicalRelationTerm(term = '') {
  if (/^(operations?|operational|operating)$/.test(term)) return 'operate';
  if (/^(deliver|delivers|delivered|delivering|delivery|build|builds|building|buildings|built|construction|constructing|constructed|complete|completed|completion|commissioning|commissioned)$/.test(term)) return 'delivery';
  if (/^(financing|finance|financed|funding|funded|capital|debt|equity|investment|investments|pricing|cost|costs|economics|returns?|shareholders?|value|values|valued)$/.test(term)) return 'finance';
  if (/^(contract|contracted|commitment|committed|agreement|lease|leased|term|terms)$/.test(term)) return 'contract';
  if (/^(announce|announced|announcement|disclose|disclosed|disclosure|disclosures|filing|filings)$/.test(term)) return 'disclosure';
  if (/^(utility|utilities|power|powered|grid|substation|substations|electric|electrical|energization|interconnection)$/.test(term)) return 'power';
  if (/^(cooling|cooled|heat|thermal|water)$/.test(term)) return 'thermal';
  if (/^(tenant|tenants|customer|customers|buyer|buyers|hyperscaler|hyperscalers|counterparty|counterparties)$/.test(term)) return 'customer';
  if (/^(name|named|unnamed)$/.test(term)) return 'name';
  if (/^(develop|developed|developer|developers|development|developing)$/.test(term)) return 'develop';
  if (/^(schedule|scheduled|timing|timeline|calendar|date|dates|time|phase|phases|ramp|milestone|milestones|checkpoint|checkpoints|target|targeted|commencement|delay|delayed|late)$/.test(term)) return 'schedule';
  if (/^(capacity|load|loads|megawatt|megawatts|usable)$/.test(term)) return 'capacity';
  if (/^(risk|risks|uncertainty|uncertain)$/.test(term)) return 'risk';
  if (/^(revenue|rent|cash|payment|payments)$/.test(term)) return 'revenue';
  if (/^(demand|reservation|reservations|reserved|workload|workloads)$/.test(term)) return 'demand';
  if (/^(equipment|supplier|suppliers|transformer|transformers|procurement|supply)$/.test(term)) return 'supply';
  if (/^(permit|permits|permitting|approval|approvals|regulator|regulators|regulatory|zoning)$/.test(term)) return 'approval';
  if (/^(campus|campuses|site|sites|facility|facilities|land)$/.test(term)) return 'site';
  if (/^(system|systems|service|services)$/.test(term)) return 'delivery';
  return '';
}

function relationAnchors(value = '') {
  const terms = (String(value || '').toLowerCase().match(/[a-z0-9]+/g) || [])
    .filter((term) => term.length >= 4 || /^\d+$/.test(term))
    .map(canonicalRelationTerm)
    .filter(Boolean);
  const numeric = normalizedNumericMentions(value).map((mention) => `numeric:${mention}`);
  return [...new Set([...terms, ...numeric])];
}

function inferenceIsPremiseBound(claim = '', premises = []) {
  const premiseText = premises.join(' ');
  const premiseAnchors = new Set(relationAnchors(premiseText));
  const overlap = relationAnchors(claim).filter((term) => premiseAnchors.has(term));
  const certaintyTerms = String(claim).toLowerCase().match(/\b(?:immediate(?:ly)?|binding|certain(?:ly)?|definite(?:ly)?|inevitable|inevitably)\b/g) || [];
  const premiseLower = premiseText.toLowerCase();
  const unsupportedAbsolute = certaintyTerms.some((term) => !premiseLower.includes(term.replace(/(?:d|ly|s)$/, '')));
  const guaranteePredicate = /\bguaranteed\b/i.test(claim)
    || /\b(?:lease|contract|agreement|commitment|customer|tenant|company|filing|source)\b[^.!?]{0,40}\bguarantees?\b/i.test(claim);
  const unsupportedGuarantee = guaranteePredicate && !/\bguarantee/i.test(premiseText);
  const unsupportedCertainty = unsupportedAbsolute || unsupportedGuarantee;
  return overlap.length >= 2 && !unsupportedCertainty;
}

function declaredAnalyticalInference(claim = '', evidencePack = {}) {
  const claimTerms = normalizedTerms(claim);
  if (!claimTerms.length) return false;
  const evidence = [
    evidencePack.evidenceText,
    ...(evidencePack.facts || []),
  ].join(' ');
  return (evidencePack.analyticalInferences || []).some((inference) => {
    if (!inference || typeof inference !== 'object' || Array.isArray(inference)) return false;
    const inferenceTerms = normalizedTerms(inference.claim);
    if (!inferenceTerms.length) return false;
    const overlap = claimTerms.filter((term) => inferenceTerms.includes(term)).length;
    const premises = Array.isArray(inference.premises) ? inference.premises : [];
    const introducesNewNumbers = introducesNewNumericMention(claim, evidence);
    return overlap / Math.min(claimTerms.length, inferenceTerms.length) >= 0.6
      && premises.length > 0
      && premises.every((premise) => premiseIsSourceGrounded(premise, evidence))
      && inferenceIsPremiseBound(inference.claim, premises)
      && !introducesNewNumbers;
  });
}

function checkExtractedClaimsAgainstEvidence(claims = [], evidencePack = {}) {
  const evidence = evidenceSentences(evidencePack);
  const evidenceUnsupported = claims.filter((claim) => !claimIsSourceGrounded(claim, evidence));
  const analyticalInferenceClaims = evidenceUnsupported.filter((claim) => declaredAnalyticalInference(claim, evidencePack));
  const unsupported = evidenceUnsupported.filter((claim) => !analyticalInferenceClaims.includes(claim));
  return {
    ok: unsupported.length === 0,
    totalClaims: claims.length,
    unsupportedClaims: unsupported,
    analyticalInferenceClaims,
  };
}

export function checkClaimsAgainstEvidence(body = '', evidencePack = {}) {
  return checkExtractedClaimsAgainstEvidence(extractClaims(body), evidencePack);
}

export function seoMetadataClaimsSupported(article = {}, evidencePack = {}) {
  const seoText = [
    article.title,
    article.deck,
    article.summary,
    article.snippet,
    article.why_it_matters,
    article.public_presentation?.deck,
    article.public_presentation?.why_it_matters,
    article.expertLensFull?.metaDescription,
  ].filter(Boolean).join('. ');
  const result = checkExtractedClaimsAgainstEvidence(
    extractClaims(seoText, { skipStandaloneHeadings: false }),
    evidencePack
  );
  return {
    ...result,
    ok: result.unsupportedClaims.length === 0,
  };
}
