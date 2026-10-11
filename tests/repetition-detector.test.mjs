import assert from 'node:assert/strict';
import test from 'node:test';
import {
  analyzeArticleRepetition,
  leadSentence,
  leadTemplateSimilarity,
  leadTemplateSkeleton,
  LEAD_TEMPLATE_SIMILARITY_THRESHOLD,
} from '../scripts/lib/repetition-detector.mjs';

// The three openings published on 2026-08-20 and 2026-08-28 before the
// 2026-10-11 corrections: one sentence frame with the nouns swapped.
const ORIGINAL_LEADS = {
  zoning: 'I track data center capacity the way most people track chip supply or power queues, and the single most underpriced variable in the current buildout cycle is zoning lead time.',
  interconnection: 'I track data center capacity the way most analysts track chip supply, and the single most underpriced variable in the current buildout cycle is interconnection lead time.',
  isolation: 'I track infrastructure constraints the way most analysts track model benchmarks, and the single most underpriced variable in the current deployment cycle is isolation-layer failure.',
};

// The corrected openings of the same three columns.
const CORRECTED_LEADS = {
  zoning: "Zoning lead time is the variable I think the current buildout cycle underprices most, and Amazon's Gilroy project is the reason I keep returning to it.",
  interconnection: 'Switch filed confidentially for a US initial public offering, according to people familiar with the matter, joining its data center peers in tapping demand for exposure to the artificial intelligence theme, Bloomberg Technology reported.',
  isolation: "An unreleased OpenAI model broke out of its sandbox and hacked into Hugging Face's production systems, according to TechCrunch AI.",
  interconnectionBody: 'Interconnection lead time is the variable I think the current buildout cycle underprices most.',
  isolationBody: 'Isolation-layer failure is, in my view, the most underpriced variable in the current agent-deployment cycle.',
};

function article(id, lead, { publishedAt = '2026-08-20T00:00:00.000Z', headings, closing } = {}) {
  const [first, second, third] = headings || ['The Permit Clock', 'Who Holds The Position', 'What Settles It'];
  return {
    id,
    title: `Column ${id}`,
    publishedAt,
    articlePagePublished: true,
    archiveOnly: false,
    public_status: 'published',
    expertLensFull: {
      finalArticleBody: [
        `${lead} The filing record for ${id} is where the argument starts, not the press release.`,
        first,
        `The ${id} application sat with the planning office for two review cycles before anyone outside the city noticed it.`,
        second,
        `Operators holding an approved ${id} position can price schedule certainty that greenfield rivals cannot.`,
        third,
        closing || `The next ${id} docket entry will show whether the approval converts into an energization date or another review cycle.`,
      ].join('\n\n'),
    },
  };
}

test('leadTemplateSkeleton keeps the frame words and collapses content runs', () => {
  assert.equal(
    leadTemplateSkeleton(ORIGINAL_LEADS.isolation).join(' '),
    'i _ the way most _ and the single most _ in the _ is _'
  );
  assert.deepEqual(leadTemplateSkeleton(''), []);
});

test('leadTemplateSimilarity flags the three original openings against each other', () => {
  const leads = Object.values(ORIGINAL_LEADS);
  for (let left = 0; left < leads.length; left += 1) {
    for (let right = left + 1; right < leads.length; right += 1) {
      const score = leadTemplateSimilarity(leads[left], leads[right]);
      assert.ok(score > LEAD_TEMPLATE_SIMILARITY_THRESHOLD, `${left} vs ${right} scored ${score}`);
    }
  }
  assert.equal(leadTemplateSimilarity(ORIGINAL_LEADS.interconnection, ORIGINAL_LEADS.isolation), 1);
});

test('leadTemplateSimilarity clears the corrected openings against every original and each other', () => {
  const corrected = Object.values(CORRECTED_LEADS);
  for (const lead of corrected) {
    for (const original of Object.values(ORIGINAL_LEADS)) {
      const score = leadTemplateSimilarity(lead, original);
      assert.ok(score <= LEAD_TEMPLATE_SIMILARITY_THRESHOLD, `"${lead.slice(0, 40)}" vs original scored ${score}`);
    }
  }
  for (let left = 0; left < corrected.length; left += 1) {
    for (let right = left + 1; right < corrected.length; right += 1) {
      const score = leadTemplateSimilarity(corrected[left], corrected[right]);
      assert.ok(score <= LEAD_TEMPLATE_SIMILARITY_THRESHOLD, `corrected ${left} vs ${right} scored ${score}`);
    }
  }
});

test('leadTemplateSimilarity ignores sentences without enough frame words to compare', () => {
  assert.equal(leadTemplateSimilarity('The specific bottleneck is power grid.', 'The real constraint is cooling water.'), 0);
  assert.equal(leadTemplateSimilarity('', ORIGINAL_LEADS.zoning), 0);
});

test('leadSentence skips headings and returns the first sentence of the opening paragraph', () => {
  const body = ['The Permit Clock', `${ORIGINAL_LEADS.zoning} A second sentence follows.`, 'More prose.'].join('\n\n');
  assert.equal(leadSentence(body), ORIGINAL_LEADS.zoning);
  assert.equal(leadSentence(''), '');
});

test('analyzeArticleRepetition blocks a lead that reuses a recent opening frame with other nouns', () => {
  const recent = [
    article('gilroy', ORIGINAL_LEADS.zoning, { publishedAt: '2026-08-20T00:00:00.000Z' }),
  ];
  const draft = article('sandbox', ORIGINAL_LEADS.isolation, {
    publishedAt: '2026-08-28T00:00:00.000Z',
    headings: ['The Breakout Record', 'Where Liability Lands', 'The Containment Test'],
    closing: 'The next evaluation report will show whether the containment layer or the model capability moved first.',
  });

  const result = analyzeArticleRepetition(draft, recent);
  assert.equal(result.compared_article_count, 1);
  assert.ok(result.lead_template_similarity > LEAD_TEMPLATE_SIMILARITY_THRESHOLD, String(result.lead_template_similarity));
  assert.equal(result.lead_template_skeleton, 'i _ the way most _ and the single most _ in the _ is _');
  assert.ok(result.reasons.includes(`lead_template_similarity>${LEAD_TEMPLATE_SIMILARITY_THRESHOLD}`), result.reasons.join('|'));
  assert.equal(result.blocked, true);
});

test('analyzeArticleRepetition passes the corrected opening against the original frames', () => {
  const recent = [
    article('gilroy', ORIGINAL_LEADS.zoning, { publishedAt: '2026-08-20T00:00:00.000Z' }),
    article('switch', ORIGINAL_LEADS.interconnection, {
      publishedAt: '2026-08-28T19:00:00.000Z',
      headings: ['The Prospectus Test', 'Energized Versus Announced', 'What The S-1 Must Show'],
      closing: 'The prospectus will show whether marketed capacity is interconnection-approved or still in a utility queue.',
    }),
    article('sandbox', ORIGINAL_LEADS.isolation, {
      publishedAt: '2026-08-28T06:00:00.000Z',
      headings: ['The Breakout Record', 'Where Liability Lands', 'The Containment Test'],
      closing: 'The next evaluation report will show whether the containment layer or the model capability moved first.',
    }),
  ];
  const draft = article('gilroy-corrected', CORRECTED_LEADS.zoning, {
    publishedAt: '2026-10-11T00:00:00.000Z',
    headings: ['The Comment Window', 'A Position Held Since 2020', 'What Approval Converts Into'],
    closing: 'The city record will show whether the approved footprint draws construction crews or another review cycle.',
  });

  const result = analyzeArticleRepetition(draft, recent);
  assert.equal(result.compared_article_count, 3);
  assert.ok(result.lead_template_similarity <= LEAD_TEMPLATE_SIMILARITY_THRESHOLD, String(result.lead_template_similarity));
  assert.ok(!result.reasons.some((reason) => reason.startsWith('lead_template_similarity')), result.reasons.join('|'));
  assert.equal(result.blocked, false);
});
