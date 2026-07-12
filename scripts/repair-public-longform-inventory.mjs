import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { fileURLToPath } from 'node:url';
import {
  ARCHIVE_NEWS_PATH,
  LATEST_NEWS_PATH,
  SEARCH_INDEX_PATH,
} from './lib/constants.mjs';
import { articleDetailQualityResult } from './lib/article-detail-quality-gate.mjs';
import { cardCopyQualityResult, generateCardCopy } from './lib/card-copy-quality-gate.mjs';
import { archiveOnlyNoindexArticle } from './lib/content-quarantine.mjs';
import { longformQualityResult } from './lib/longform-engine.mjs';
import { analyzeArticleRepetition } from './lib/repetition-detector.mjs';
import { sourceExtractionPassesPublicGate } from './lib/source-extraction-fail-closed.mjs';
import { checkClaimsAgainstEvidence, seoMetadataClaimsSupported } from './lib/source-fidelity-claim-check.mjs';
import { sourceFidelityCheck } from './lib/source-fidelity-check.mjs';
import { routeStrictInfrastructureRelevance } from './lib/strict-infrastructure-relevance-router.mjs';
import { safeSourceUrlFor } from '../src/lib/seo-safeguards.js';
import { articleImageAlt, articleImageVariants } from './lib/article-image-surface.mjs';

export const CURATED_ARTICLE_ID = '99520a2a1435cecd';

const PRIMARY_SOURCE_URL = 'https://ir.applieddigital.com/sec-filings/all-sec-filings/content/0001144879-26-000036/apld_deltaforgexprxfinal.htm';
const SECONDARY_SOURCE_URL = 'https://www.datacenterdynamics.com/en/news/applied-digital-secures-300mw-lease-with-hyperscaler-at-louisiana-data-center-campus/';
const MIGRATION_VERSION = 'public-longform-inventory-v2';
const DEFAULT_PATHS = {
  latest: LATEST_NEWS_PATH,
  archived: ARCHIVE_NEWS_PATH,
  searchIndex: SEARCH_INDEX_PATH,
};

const SOURCE_NOTES = [
  'Applied Digital announced on April 23, 2026 that it signed an estimated 15-year lease with a new U.S.-based high investment-grade hyperscaler at Delta Forge 1.',
  'The company values the base lease at approximately $7.5 billion and says it covers 300 MW of critical IT load for AI and high-performance computing infrastructure.',
  'Delta Forge 1 is designed around 430 MW of utility power and two 150 MW data center buildings on more than 500 acres.',
  'Applied Digital expects initial operations at the campus to begin in mid-2027.',
  'The tenant was not named. Applied Digital described it as the second U.S.-based investment-grade hyperscaler in its portfolio across three AI Factory campuses.',
  'The same announcement said Applied Digital expected to arrange an up to $300 million bridge facility for a separate Polaris Forge 1 building and an up to $300 million revolving facility for development and working capital.',
  'Applied Digital said the lease increased its total contracted revenue to more than $23 billion and that the Delta Forge campus could scale beyond the initial utility allocation in 2028 and later.',
  'The company had announced the groundbreaking in January 2026 and described the first phase as two 150 MW facilities with power integration, cooling, and operating systems designed for high-density workloads.',
  'Its April disclosure does not identify the hyperscaler or provide building-level rent commencement dates, escalation terms, project cost, or the financing package specific to Delta Forge 1.',
  'These figures are company disclosures and forward-looking statements. They do not establish that construction, energization, rent commencement, financing, or customer deployment will occur on the stated schedule.',
].join(' ');

function inferenceGroup(premises, claims) {
  return claims.map((claim) => ({ claim, premises }));
}

const ANALYTICAL_INFERENCES = [
  {
    claim: 'The commitment is substantial, but it does not make the capacity operational today.',
    premises: [
      'Applied Digital signed an estimated 15-year lease with a new U.S.-based high investment-grade hyperscaler at Delta Forge 1.',
      'Applied Digital expects initial operations at the campus to begin in mid-2027.',
    ],
  },
  {
    claim: 'Before the agreement, the central question was whether Applied Digital could find a tenant for the large power position.',
    premises: [
      'Applied Digital signed an estimated 15-year lease with a new U.S.-based high investment-grade hyperscaler at Delta Forge 1.',
    ],
  },
  {
    claim: 'The lease answers the demand question for the first 300 MW of IT load.',
    premises: [
      'The company says the lease covers 300 MW of critical IT load for AI and high-performance computing infrastructure.',
    ],
  },
  {
    claim: 'The harder question is whether the developer can deliver two 150 MW buildings and reach rent commencement on schedule.',
    premises: [
      'Delta Forge 1 is designed around 430 MW of utility power and two 150 MW data center buildings on more than 500 acres.',
      'Applied Digital expects initial operations at the campus to begin in mid-2027.',
    ],
  },
  {
    claim: 'The utility-power to critical-load ratio is an arithmetic observation, not a disclosed efficiency guarantee.',
    premises: [
      'Delta Forge 1 is designed around 430 MW of utility power and two 150 MW data center buildings on more than 500 acres.',
      'The company says the lease covers 300 MW of critical IT load for AI and high-performance computing infrastructure.',
    ],
  },
  {
    claim: 'Delivering 300 MW of IT capacity requires more than securing servers.',
    premises: [
      'The company says the lease covers 300 MW of critical IT load for AI and high-performance computing infrastructure.',
      'The first phase has power integration, cooling, and operating systems designed for high-density workloads.',
    ],
  },
  {
    claim: 'The campus must distribute power, reject heat, and maintain redundancy while the buildings enter service.',
    premises: [
      'The first phase has power integration, cooling, and operating systems designed for high-density workloads.',
    ],
  },
  {
    claim: 'A lease reduces demand uncertainty but does not establish delivery on the stated schedule.',
    premises: [
      'Applied Digital signed an estimated 15-year lease with a new U.S.-based high investment-grade hyperscaler at Delta Forge 1.',
      'These figures are company disclosures and forward-looking statements. They do not establish that construction, energization, rent commencement, financing, or customer deployment will occur on the stated schedule.',
    ],
  },
  {
    claim: "A 15-year obligation is only as useful as the counterparty's ability and willingness to perform.",
    premises: [
      'Applied Digital signed an estimated 15-year lease with a new U.S.-based high investment-grade hyperscaler at Delta Forge 1.',
    ],
  },
  {
    claim: 'The missing tenant name limits outside analysis of workload plans, deployment timing, renewal behavior, and concentration.',
    premises: [
      'The tenant was not named and Applied Digital described it as a U.S.-based investment-grade hyperscaler.',
      'The disclosure does not identify the hyperscaler or provide building-level rent commencement dates, escalation terms, project cost, or financing terms.',
    ],
  },
  {
    claim: 'Data center developers spend heavily before a tenant begins paying rent.',
    premises: [
      'Applied Digital expected to arrange an up to $300 million bridge facility and an up to $300 million revolving facility for development and working capital.',
      'The disclosure does not provide building-level rent commencement dates.',
    ],
  },
  {
    claim: "Debt pricing, required equity, completion guarantees, and contingency reserves will determine how much of the contract's value can accrue to shareholders.",
    premises: [
      'The disclosure does not provide the financing package specific to Delta Forge 1.',
      'Applied Digital expected to arrange an up to $300 million bridge facility and an up to $300 million revolving facility for development and working capital.',
      'These figures are company disclosures and forward-looking statements. They do not establish that construction, energization, rent commencement, financing, or customer deployment will occur on the stated schedule.',
    ],
  },
  {
    claim: 'Equipment suppliers, electrical contractors, cooling vendors, and local infrastructure providers may gain a more dependable order pipeline if the schedule proceeds.',
    premises: [
      'Delta Forge 1 is designed around 430 MW of utility power and two 150 MW data center buildings on more than 500 acres.',
      'The first phase has power integration, cooling, and operating systems designed for high-density workloads.',
    ],
  },
  {
    claim: 'The lease is a strong demand signal paired with a demanding execution calendar.',
    premises: [
      'The company says the lease covers 300 MW of critical IT load for AI and high-performance computing infrastructure.',
      'Applied Digital expects initial operations at the campus to begin in mid-2027.',
      'The figures are company disclosures and forward-looking statements that do not establish delivery on the stated schedule.',
    ],
  },
  {
    claim: 'Contracted megawatts and operating megawatts are not interchangeable.',
    premises: [
      'The company says the lease covers 300 MW of critical IT load for AI and high-performance computing infrastructure.',
      'Applied Digital expects initial operations at the campus to begin in mid-2027.',
      'These figures are company disclosures and forward-looking statements. They do not establish that construction, energization, rent commencement, financing, or customer deployment will occur on the stated schedule.',
    ],
  },
  {
    claim: 'For capacity buyers, the useful date is not the announcement date.',
    premises: [
      'Applied Digital expects initial operations at the campus to begin in mid-2027.',
      'These figures are company disclosures and forward-looking statements. They do not establish that construction, energization, rent commencement, financing, or customer deployment will occur on the stated schedule.',
    ],
  },
  {
    claim: 'The useful date is when a building can accept racks, sustain contracted load, and meet lease service conditions.',
    premises: [
      'The company had announced the groundbreaking in January 2026 and described the first phase as two 150 MW facilities with power integration, cooling, and operating systems designed for high-density workloads.',
      'Its April disclosure does not identify the hyperscaler or provide building-level rent commencement dates, escalation terms, project cost, or the financing package specific to Delta Forge 1.',
    ],
  },
  {
    claim: 'The difference between utility power and critical IT load covers supporting electrical and cooling infrastructure.',
    premises: [
      'Delta Forge 1 is designed around 430 MW of utility power and two 150 MW data center buildings on more than 500 acres.',
      'The company had announced the groundbreaking in January 2026 and described the first phase as two 150 MW facilities with power integration, cooling, and operating systems designed for high-density workloads.',
    ],
  },
  {
    claim: 'A delay in any supporting system can hold back usable IT load while the customer commitment remains intact.',
    premises: [
      'The company had announced the groundbreaking in January 2026 and described the first phase as two 150 MW facilities with power integration, cooling, and operating systems designed for high-density workloads.',
      'These figures are company disclosures and forward-looking statements. They do not establish that construction, energization, rent commencement, financing, or customer deployment will occur on the stated schedule.',
    ],
  },
  {
    claim: 'An annualized calculation helps size the agreement but is not a revenue forecast.',
    premises: [
      'The company values the base lease at approximately $7.5 billion and says it covers 300 MW of critical IT load for AI and high-performance computing infrastructure.',
      'Its April disclosure does not identify the hyperscaler or provide building-level rent commencement dates, escalation terms, project cost, or the financing package specific to Delta Forge 1.',
    ],
  },
  {
    claim: 'Capital must be available early enough to preserve the mid-2027 delivery target.',
    premises: [
      'Applied Digital expects initial operations at the campus to begin in mid-2027.',
      'The same announcement said Applied Digital expected to arrange an up to $300 million bridge facility for a separate Polaris Forge 1 building and an up to $300 million revolving facility for development and working capital.',
    ],
  },
  {
    claim: 'Project economics depend on construction cost, financing cost, drawdowns, and the start of recognized revenue and cash.',
    premises: [
      'Its April disclosure does not identify the hyperscaler or provide building-level rent commencement dates, escalation terms, project cost, or the financing package specific to Delta Forge 1.',
    ],
  },
  {
    claim: 'An initial revenue-bearing phase could precede full campus availability while later phases retain delivery risk.',
    premises: [
      'Its April disclosure does not identify the hyperscaler or provide building-level rent commencement dates, escalation terms, project cost, or the financing package specific to Delta Forge 1.',
      'Applied Digital expects initial operations at the campus to begin in mid-2027.',
    ],
  },
  {
    claim: 'Investors need later filings rather than customer labels to assess concentration.',
    premises: [
      'The tenant was not named. Applied Digital described it as the second U.S.-based investment-grade hyperscaler in its portfolio across three AI Factory campuses.',
      'Its April disclosure does not identify the hyperscaler or provide building-level rent commencement dates, escalation terms, project cost, or the financing package specific to Delta Forge 1.',
    ],
  },
  {
    claim: 'A large contract and a large funding requirement can coexist.',
    premises: [
      'The company values the base lease at approximately $7.5 billion and says it covers 300 MW of critical IT load for AI and high-performance computing infrastructure.',
      'The same announcement said Applied Digital expected to arrange an up to $300 million bridge facility for a separate Polaris Forge 1 building and an up to $300 million revolving facility for development and working capital.',
    ],
  },
  {
    claim: 'The hyperscaler gains a dedicated block of future capacity without developing the entire campus itself.',
    premises: [
      'The company values the base lease at approximately $7.5 billion and says it covers 300 MW of critical IT load for AI and high-performance computing infrastructure.',
      'The tenant was not named. Applied Digital described it as the second U.S.-based investment-grade hyperscaler in its portfolio across three AI Factory campuses.',
    ],
  },
  {
    claim: 'Lenders retain completion and concentration risk until the buildings operate and rent begins.',
    premises: [
      'Its April disclosure does not identify the hyperscaler or provide building-level rent commencement dates, escalation terms, project cost, or the financing package specific to Delta Forge 1.',
      'These figures are company disclosures and forward-looking statements. They do not establish that construction, energization, rent commencement, financing, or customer deployment will occur on the stated schedule.',
    ],
  },
  {
    claim: 'Utilities and public agencies must deliver infrastructure and approvals outside the data hall.',
    premises: [
      'Delta Forge 1 is designed around 430 MW of utility power and two 150 MW data center buildings on more than 500 acres.',
      'These figures are company disclosures and forward-looking statements. They do not establish that construction, energization, rent commencement, financing, or customer deployment will occur on the stated schedule.',
    ],
  },
  {
    claim: 'Later filings should clarify ramp timing, capital intensity, concentration, guarantees, and completion penalties.',
    premises: [
      'Its April disclosure does not identify the hyperscaler or provide building-level rent commencement dates, escalation terms, project cost, or the financing package specific to Delta Forge 1.',
      'The tenant was not named. Applied Digital described it as the second U.S.-based investment-grade hyperscaler in its portfolio across three AI Factory campuses.',
    ],
  },
  {
    claim: 'The commercial value depends on converting 430 MW of utility power into customer-ready capacity by mid-2027.',
    premises: [
      'Delta Forge 1 is designed around 430 MW of utility power and two 150 MW data center buildings on more than 500 acres.',
      'Applied Digital expects initial operations at the campus to begin in mid-2027.',
    ],
  },
  {
    claim: 'The lease headline establishes demand while delivery and rent commencement determine operating capacity.',
    premises: [
      'The company values the base lease at approximately $7.5 billion and says it covers 300 MW of critical IT load for AI and high-performance computing infrastructure.',
      'These figures are company disclosures and forward-looking statements. They do not establish that construction, energization, rent commencement, financing, or customer deployment will occur on the stated schedule.',
    ],
  },
  ...inferenceGroup([
    'Applied Digital announced on April 23, 2026 that it signed an estimated 15-year lease with a new U.S.-based high investment-grade hyperscaler at Delta Forge 1.',
    'The company values the base lease at approximately $7.5 billion and says it covers 300 MW of critical IT load for AI and high-performance computing infrastructure.',
    'Delta Forge 1 is designed around 430 MW of utility power and two 150 MW data center buildings on more than 500 acres.',
    'Applied Digital expects initial operations at the campus to begin in mid-2027.',
    'Its April disclosure does not identify the hyperscaler or provide building-level rent commencement dates, escalation terms, project cost, or the financing package specific to Delta Forge 1.',
    'These figures are company disclosures and forward-looking statements. They do not establish that construction, energization, rent commencement, financing, or customer deployment will occur on the stated schedule.',
  ], [
    'Applied Digital moved Delta Forge 1 from a speculative capacity project to a contracted delivery obligation.',
    'A new investment-grade hyperscaler signed an estimated 15-year lease for 300 MW of critical IT load at the Louisiana campus.',
    'Applied Digital values the base term at about $7.5 billion.',
    'Initial service is still targeted for mid-2027.',
    'A signed lease can improve financing visibility and reduce marketing risk while delivery risk remains.',
    "Applied Digital's 300 MW Delta Forge lease shifts the risk from demand to delivery.",
    'A 15-year hyperscaler lease removes much of Delta Forge 1 demand risk, leaving delivery as the harder test.',
    'Applied Digital has contracted 300 MW of critical IT load at Delta Forge 1.',
    'The agreement shifts attention from tenant demand to delivering two 150 MW buildings for an unnamed hyperscaler.',
    'Applied Digital says the estimated 15-year lease covers 300 MW of critical IT load.',
    'Power delivery, financing, and commissioning now set the schedule.',
    'Applied Digital has leased 300 MW at Delta Forge 1.',
    'Delta Forge 1 still has to become capacity.',
  ]),
  ...inferenceGroup([
    'The company values the base lease at approximately $7.5 billion and says it covers 300 MW of critical IT load for AI and high-performance computing infrastructure.',
    'Delta Forge 1 is designed around 430 MW of utility power and two 150 MW data center buildings on more than 500 acres.',
    'The company had announced the groundbreaking in January 2026 and described the first phase as two 150 MW facilities with power integration, cooling, and operating systems designed for high-density workloads.',
  ], [
    'Delta Forge 1 is designed for 430 MW of utility power and 300 MW of critical IT load.',
    'Critical IT load occupies most, but not all, of the stated utility envelope.',
    'The next year must absorb civil work, utility coordination, long-lead electrical equipment, building systems, customer fit-out, testing, and commissioning.',
    'The third checkpoint is conversion from gross utility power to energized critical IT load, reported building by building.',
  ]),
  ...inferenceGroup([
    'Its April disclosure does not identify the hyperscaler or provide building-level rent commencement dates, escalation terms, project cost, or the financing package specific to Delta Forge 1.',
    'These figures are company disclosures and forward-looking statements. They do not establish that construction, energization, rent commencement, financing, or customer deployment will occur on the stated schedule.',
  ], [
    'The release does not provide the rent commencement schedule, escalation clauses, tenant improvement treatment, service revenue, operating expense recovery, or full ramp timing.',
    'The company has not published a building-by-building handoff schedule in the announcement.',
    'Readers should separate construction completion, utility energization, and customer-ready service.',
    'A project can have an attractive customer and still produce weak returns if financing is expensive or construction costs outrun contracted economics.',
    'Applied Digital carries delivery, cost, financing, and operating risk.',
    'The tenant carries schedule risk if planned capacity is late.',
    'The first checkpoint is whether Applied Digital closes project financing on terms that preserve the expected return.',
    'The second checkpoint is whether utility and construction milestones support a mid-2027 initial service date.',
    'Construction, energization, financing, and rent commencement decide when the lease becomes operating capacity.',
  ]),
  ...inferenceGroup([
    'The tenant was not named. Applied Digital described it as the second U.S.-based investment-grade hyperscaler in its portfolio across three AI Factory campuses.',
    'Its April disclosure does not identify the hyperscaler or provide building-level rent commencement dates, escalation terms, project cost, or the financing package specific to Delta Forge 1.',
  ], [
    'Applied Digital identifies the tenant only as a U.S.-based high investment-grade hyperscaler.',
    'The company says the agreement adds a second U.S. investment-grade hyperscaler across three campuses.',
    'The disclosure suggests some customer diversification but does not support a concentration calculation.',
    'That suggests some customer diversification, but the release does not provide enough detail to calculate tenant concentration by revenue, capacity, or capital at risk.',
  ]),
  ...inferenceGroup([
    'The company values the base lease at approximately $7.5 billion and says it covers 300 MW of critical IT load for AI and high-performance computing infrastructure.',
    'The same announcement said Applied Digital expected to arrange an up to $300 million bridge facility for a separate Polaris Forge 1 building and an up to $300 million revolving facility for development and working capital.',
    'Its April disclosure does not identify the hyperscaler or provide building-level rent commencement dates, escalation terms, project cost, or the financing package specific to Delta Forge 1.',
  ], [
    'Spreading the announced base value evenly across the lease term implies a substantial annualized run rate.',
    'Long-duration revenue from an investment-grade customer may support project debt on better terms than an unleased campus.',
    'The announcement described an up to $300 million bridge facility and an up to $300 million revolving facility outside Delta Forge 1.',
    'Future disclosures should connect sources and uses of capital to construction milestones.',
    'Applied Digital gains a committed customer and a clearer basis for financing a campus already under construction.',
  ]),
];

const CURATED_BODY = `Applied Digital has moved Delta Forge 1 from a speculative capacity project to a contracted delivery obligation. The company says a new investment-grade hyperscaler signed an estimated 15-year lease for 300 MW of critical IT load at the Louisiana campus. Applied Digital values the base term at about $7.5 billion. That is a substantial commitment, but it does not make the capacity operational today. Initial service is still targeted for mid-2027.

The Lease Resets the Question

Before the agreement, the central question was whether Applied Digital could find a tenant for a large power position. The lease answers that demand question for the first 300 MW of IT load. The harder question now is delivery: whether the developer can complete two 150 MW buildings, coordinate utility infrastructure, install the mechanical and electrical systems, and reach rent commencement on the schedule assumed by the customer and lenders.

That distinction matters because contracted megawatts and operating megawatts are not interchangeable. A signed lease can improve financing visibility and reduce marketing risk, while construction, energization, commissioning, and fit-out risk remain. For capacity buyers, the useful date is not the announcement date. It is the date at which a building can accept racks, sustain the contracted load, and meet the service conditions in the lease.

What 430 MW Has To Support

Delta Forge 1 is designed for 430 MW of utility power and 300 MW of critical IT load. The difference between utility power and critical IT load covers the infrastructure between the grid connection and the computing equipment, including cooling and electrical losses, as well as operating reserve. Critical IT load occupies most, but not all, of the stated utility envelope. That relationship is an arithmetic observation, not a disclosed efficiency guarantee.

Delivering 300 MW of IT capacity requires more than securing servers. The campus has to bring power through substations and distribution equipment, reject heat under high-density workloads, and maintain redundancy while two large buildings enter service. A delay in any one of those systems can hold back the usable IT load even when the customer commitment remains intact.

Revenue Visibility Is Not Cash Flow

Spreading the announced base value evenly across the lease term implies a substantial annualized run rate. That simple calculation helps size the agreement, but it should not be read as a revenue forecast. The release does not provide the rent commencement schedule, escalation clauses, tenant improvement treatment, service revenue, operating expense recovery, or the timing of the full 300 MW ramp.

Long-duration revenue from an investment-grade customer may support project debt on better terms than an unleased campus. It also creates a measurable obligation: capital has to be available early enough to preserve the mid-2027 delivery target. The economics will depend on construction cost, financing cost, the pace of drawdowns, and the point at which contracted value begins converting into recognized revenue and cash.

The Mid-2027 Delivery Test

Applied Digital broke ground on Delta Forge 1 before announcing the lease and says initial operations are expected in mid-2027. The next year must absorb civil work, utility coordination, long-lead electrical equipment, building systems, customer fit-out, testing, and commissioning. A lease reduces demand uncertainty, but the company's forward-looking statements do not establish delivery on the stated schedule.

The company has not published a building-by-building handoff schedule in the announcement. Readers should therefore separate three milestones: construction completion, utility energization, and customer-ready service. The first revenue-bearing phase could arrive before the full 300 MW is available, while later phases remain exposed to equipment, labor, permitting, or power-delivery slippage.

Customer Quality And Concentration

Applied Digital identifies the tenant only as a U.S.-based high investment-grade hyperscaler. The credit description is relevant because a 15-year obligation is only as useful as the counterparty's ability and willingness to perform. The missing name, however, limits outside analysis of workload plans, deployment timing, renewal behavior, and concentration across the developer's portfolio.

The company says the agreement adds a second U.S. investment-grade hyperscaler across three campuses. That suggests some customer diversification, but the release does not provide enough detail to calculate tenant concentration by revenue, capacity, or capital at risk. Investors should look for those figures in later filings rather than infer diversification from the number of customer labels alone.

Capital Still Has To Cross The Gap

The announcement also described expected financing outside Delta Forge 1: an up to $300 million bridge facility for continued work on a Polaris Forge 1 building and an up to $300 million revolving facility for pre-lease and post-lease development across the platform. Those plans show why a large contract and a large funding requirement can coexist. Data center developers spend heavily before a tenant begins paying rent.

For Delta Forge 1, the most informative future disclosures will connect sources and uses of capital to specific construction milestones. Debt pricing, required equity, completion guarantees, and contingency reserves will determine how much of the contract's value can accrue to shareholders. A project can have an attractive customer and still produce weak returns if financing is expensive or construction costs move faster than contracted economics.

Who Gains And Who Is Exposed

Applied Digital gains a committed customer and a clearer basis for financing a campus already under construction. Equipment suppliers, electrical contractors, cooling vendors, and local infrastructure providers may gain a more dependable order pipeline if the schedule proceeds. The hyperscaler gains a dedicated block of future capacity without having to develop the entire campus itself.

Applied Digital carries delivery, cost, financing, and operating risk. The tenant carries schedule risk if workloads are planned around capacity that is late. Lenders carry completion and concentration risk until the buildings are operating and rent is flowing. Local utilities and public agencies must also deliver the infrastructure and approvals that sit outside the data hall.

The Evidence To Watch

The first checkpoint is whether Applied Digital closes project financing on terms that preserve the expected return. The second is whether utility and construction milestones support a mid-2027 initial service date. The third is the conversion from gross utility power to energized critical IT load, reported building by building rather than as a campus headline.

Later filings should clarify rent commencement, the pace of the 300 MW ramp, capital spent per delivered megawatt, customer concentration, and any guarantees or penalties tied to completion. Until those details are visible, the lease is best understood as a strong demand signal paired with a demanding execution calendar. Delta Forge 1 has a customer. It still has to become capacity.`;

function withoutLegacyLongformMetadata(article = {}) {
  const {
    articleBlueprint: _articleBlueprint,
    article_blueprint: _articleBlueprintLegacy,
    autonomous_quality: _autonomousQuality,
    blog_metadata: _blogMetadata,
    editorial_thesis: _editorialThesis,
    emergency_cleanup_audit: _emergencyCleanupAudit,
    narrative_dna: _narrativeDna,
    previous_generation_version: _previousGenerationVersion,
    publicArticleContract: _publicArticleContract,
    public_copy_stale: _publicCopyStale,
    public_generation_version: _publicGenerationVersion,
    quarantine_reason: _quarantineReason,
    regeneration_needed_reason: _regenerationNeededReason,
    regeneration_rank: _regenerationRank,
    repetition_block_reasons: _repetitionBlockReasons,
    repetition_blocked: _repetitionBlocked,
    routing_decision: _routingDecision,
    stale_generation: _staleGeneration,
    stale_generation_reason: _staleGenerationReason,
    ...cleaned
  } = article;
  return cleaned;
}

function curatedArticle(article = {}, recentRecords = []) {
  const title = "Applied Digital's 300 MW Delta Forge lease shifts the risk from demand to delivery";
  const image = articleImageVariants(article).hero.url;
  const draft = {
    ...withoutLegacyLongformMetadata(article),
    title,
    source: 'Applied Digital',
    sourceUrl: PRIMARY_SOURCE_URL,
    url: PRIMARY_SOURCE_URL,
    canonicalSourceUrl: PRIMARY_SOURCE_URL,
    originalSourceUrl: PRIMARY_SOURCE_URL,
    secondarySourceUrl: SECONDARY_SOURCE_URL,
    secondarySource: 'Data Center Dynamics',
    rawText: SOURCE_NOTES,
    articleText: SOURCE_NOTES,
    cleaned_source_text: SOURCE_NOTES,
    deck: 'A 15-year hyperscaler lease removes much of Delta Forge 1 demand risk, leaving power delivery, financing, and a mid-2027 commissioning schedule as the harder tests.',
    summary: 'Applied Digital has contracted 300 MW of critical IT load at Delta Forge 1. The commercial value now depends on converting 430 MW of utility power into customer-ready capacity on time.',
    snippet: 'The $7.5 billion headline establishes demand. Construction, energization, financing, and rent commencement decide when that value becomes operating capacity.',
    why_it_matters: 'The agreement shifts attention from tenant demand to the cost and timing of delivering two 150 MW buildings for an unnamed hyperscaler.',
    expertLensShort: 'The lease improves revenue visibility, but mid-2027 service still depends on utility, construction, financing, and commissioning milestones.',
    public_content_tier: 'longform_analysis',
    public_status: 'published',
    homepagePublished: true,
    articlePagePublished: true,
    signalCardOnly: false,
    archiveOnly: false,
    quarantined: false,
    noindex: false,
    seo_noindex: false,
    seo_noindex_reasons: [],
    qualityGateBlocked: false,
    qualityGateReason: '',
    generation_version: 'editorial_repair_v1',
    routing_decision: 'core_longform_blog',
    primary_category: 'Data Centers',
    infrastructure_layer: 'data center capacity',
    infrastructure_relevance: {
      ...sanitizedInfrastructureRelevance(article.infrastructure_relevance),
      infrastructure_relevance_tier: 'full_memo',
      infrastructure_relevance_action: 'generate_full_memo',
      infrastructureRelevanceAction: 'generate_full_memo',
      articlePagePublished: true,
      homepagePublished: true,
      archiveOnly: false,
    },
    expertLensFull: {
      finalHeadline: title,
      metaDescription: 'Applied Digital has leased 300 MW at Delta Forge 1. The next test is delivering power, financing, and customer-ready capacity by mid-2027.',
      thesis: 'The hyperscaler lease transfers Delta Forge 1 from demand risk to delivery risk.',
      finalArticleBody: CURATED_BODY,
      sourceLink: PRIMARY_SOURCE_URL,
    },
    evidence_pack: {
      ok: true,
      blockReasons: [],
      source: 'Applied Digital',
      title: "Applied Digital's 300 MW Delta Forge lease shifts the risk from demand to delivery",
      evidenceText: SOURCE_NOTES,
      facts: SOURCE_NOTES.split(/(?<=\.)\s+/),
      verified_facts: SOURCE_NOTES.split(/(?<=\.)\s+/),
      namedActors: ['Applied Digital', 'Delta Forge 1', 'unnamed U.S.-based investment-grade hyperscaler'],
      affectedInfrastructureLayer: 'data center capacity',
      sourceLimitations: 'The tenant is unnamed and the announcement does not disclose rent commencement, full ramp timing, or project-level financing terms.',
      watchMetrics: ['project financing terms', 'utility energization', 'customer-ready MW', 'mid-2027 initial service'],
      analyticalInferences: ANALYTICAL_INFERENCES,
    },
    public_routing: {
      score: 0.972,
      visibility: 'core',
      laneKey: 'data-centers',
      laneTitle: 'Data Centers',
      public_signal_label: 'Analysis',
      editorial_lens: 'Capacity Delivery',
      story_archetype: 'Contract-to-Capacity Analysis',
      routing_decision: 'core_longform_blog',
      blocked_reasons: [],
    },
    public_presentation: {
      id: article.id,
      image,
      image_alt: articleImageAlt({ ...article, title, expertLensFull: { finalHeadline: title } }),
      signal_label: 'Analysis',
      editorial_lens: 'Capacity Delivery',
      title: "Applied Digital's 300 MW Delta Forge lease shifts the risk from demand to delivery",
      deck: 'Applied Digital says the estimated 15-year lease covers 300 MW of critical IT load. Power delivery, financing, and commissioning now set the schedule.',
      why_it_matters: 'The commercial value depends on turning 430 MW of utility power into customer-ready IT load by the mid-2027 target.',
      reader_impact: ['Data center operators', 'Capacity buyers', 'Infrastructure investors'],
      region: 'North America',
      source: 'Applied Digital',
      view_detail: `/news/${CURATED_ARTICLE_ID}/`,
      read_source: PRIMARY_SOURCE_URL,
      lane_key: 'data-centers',
      lane_title: 'Data Centers',
      visibility: 'core',
      story_archetype: 'Contract-to-Capacity Analysis',
    },
  };
  const repetition = analyzeArticleRepetition(draft, recentRecords);
  const sourceFidelity = sourceFidelityCheck(draft, draft.evidence_pack, CURATED_BODY);
  const claimFidelity = checkClaimsAgainstEvidence(CURATED_BODY, draft.evidence_pack);
  const seoFidelity = seoMetadataClaimsSupported(draft, draft.evidence_pack);
  draft.repetition_check = repetition;
  draft.repetition_blocked = repetition.blocked;
  draft.repetition_block_reasons = repetition.reasons;
  draft.source_fidelity = sourceFidelity;
  draft.claim_fidelity = claimFidelity;
  draft.seo_fidelity = seoFidelity;
  const quality = longformQualityResult(draft);
  draft.blog_metadata = {
    tone: 'Edited infrastructure analysis',
    archetype: 'Contract-to-Capacity Analysis',
    visible_body_characters: quality.metrics.visibleBodyCharacters,
    word_count: quality.metrics.wordCount,
    paragraph_count: quality.metrics.paragraphCount,
    section_count: quality.metrics.sectionCount,
    unsupported_claim_count: claimFidelity.unsupportedClaims.length,
  };
  const detailQuality = articleDetailQualityResult(draft);
  const editorialFailures = [
    ...quality.reasons,
    ...detailQuality.reasons,
    ...(repetition.blocked ? repetition.reasons : []),
    ...(sourceFidelity.ok ? [] : sourceFidelity.unsupported),
    ...(claimFidelity.unsupportedClaims.length === 0 ? [] : ['unsupported_factual_claim']),
    ...(seoFidelity.ok ? [] : ['unsupported_seo_claim']),
  ];
  if (editorialFailures.length > 0) {
    const unsupportedBody = claimFidelity.unsupportedClaims.length
      ? ` [Claims: ${claimFidelity.unsupportedClaims.join(' | ')}]`
      : '';
    const unsupportedSeo = seoFidelity.unsupportedClaims.length
      ? ` [SEO: ${seoFidelity.unsupportedClaims.join(' | ')}]`
      : '';
    throw new Error(`curated longform failed quality gates: ${editorialFailures.join(', ')}${unsupportedBody}${unsupportedSeo}`);
  }
  return draft;
}

function claimsPublicLongform(article = {}) {
  return article.articlePagePublished === true;
}

function publicLongformFailureReasons(article = {}) {
  return [...new Set([
    ...longformQualityResult(article).reasons,
    ...articleDetailQualityResult(article).reasons,
  ])];
}

function isLegacyLongformRepair(article = {}) {
  const archivedRepair = article.public_status === 'archive_only_noindex'
    && Array.isArray(article.seo_noindex_reasons)
    && article.seo_noindex_reasons.some((reason) => String(reason).startsWith('legacy_longform_quality:'))
    && !hasCanonicalArchiveLifecycle(article);
  const sourceSignalRepair = article.public_status === 'signal'
    && Array.isArray(article.localArticleQualityReasons)
    && article.localArticleQualityReasons.length > 0;
  return archivedRepair || sourceSignalRepair || hasStaleFullMemoLifecycle(article);
}

function claimsArchiveOnly(article = {}) {
  const relevance = article.infrastructure_relevance || {};
  return article.public_status === 'archive_only_noindex'
    || article.archiveOnly === true
    || relevance.archiveOnly === true;
}

function hasCanonicalArchiveLifecycle(article = {}) {
  const relevance = article.infrastructure_relevance || {};
  return article.public_status === 'archive_only_noindex'
    && article.public_content_tier === 'hidden'
    && article.articlePagePublished === false
    && article.homepagePublished === false
    && article.archiveOnly === true
    && article.signalCardOnly === false
    && article.infrastructure_relevance_tier === 'archive_only'
    && article.infrastructure_relevance_action === 'archive_only'
    && article.infrastructureRelevanceAction === 'archive_only'
    && relevance.infrastructure_relevance_tier === 'archive_only'
    && relevance.infrastructure_relevance_action === 'archive_only'
    && relevance.infrastructureRelevanceAction === 'archive_only'
    && relevance.articlePagePublished === false
    && relevance.homepagePublished === false
    && relevance.archiveOnly === true;
}

function hasStaleFullMemoLifecycle(article = {}) {
  const claimsNonLongform = article.signalCardOnly === true
    || article.public_status === 'signal'
    || article.public_content_tier === 'signal_card'
    || claimsArchiveOnly(article);
  const relevance = article.infrastructure_relevance || {};
  return claimsNonLongform && (
    article.infrastructure_relevance_action === 'generate_full_memo'
    || article.infrastructureRelevanceAction === 'generate_full_memo'
    || article.infrastructure_relevance_tier === 'full_memo'
    || relevance.infrastructure_relevance_action === 'generate_full_memo'
    || relevance.infrastructureRelevanceAction === 'generate_full_memo'
    || relevance.infrastructure_relevance_tier === 'full_memo'
    || relevance.articlePagePublished === true
  );
}

function sanitizedInfrastructureRelevance(value = {}) {
  const scoreFields = [
    'direct_ai_infrastructure_relevance',
    'data_center_relevance',
    'cloud_capacity_relevance',
    'semiconductor_relevance',
    'power_grid_relevance',
    'cooling_relevance',
    'capital_markets_relevance',
    'enterprise_ai_infrastructure_relevance',
    'infrastructure_relevance_score',
  ];
  const sanitized = {};
  for (const field of scoreFields) {
    const score = Number(value[field]);
    if (Number.isFinite(score)) sanitized[field] = score;
  }
  if (Array.isArray(value.infrastructure_relevance_reasons)) {
    sanitized.infrastructure_relevance_reasons = value.infrastructure_relevance_reasons.map(String);
  }
  return sanitized;
}

function archivedLegacyArticle(article = {}, failureReasons = []) {
  const reasons = failureReasons.map((reason) => `legacy_longform_quality:${reason}`);
  const archived = archiveOnlyNoindexArticle(withoutLegacyLongformMetadata(article), reasons);
  return {
    ...archived,
    public_content_tier: 'hidden',
    infrastructure_relevance_tier: 'archive_only',
    infrastructure_relevance_action: 'archive_only',
    infrastructureRelevanceAction: 'archive_only',
    infrastructure_relevance: {
      ...sanitizedInfrastructureRelevance(article.infrastructure_relevance),
      infrastructure_relevance_tier: 'archive_only',
      infrastructure_relevance_action: 'archive_only',
      infrastructureRelevanceAction: 'archive_only',
      articlePagePublished: false,
      homepagePublished: false,
      archiveOnly: true,
    },
    public_routing: {
      visibility: 'archive',
      laneKey: 'archive-only',
      laneTitle: 'Archive Only',
      public_signal_label: 'Adjacent Signal',
      editorial_lens: 'Archive Only',
      routing_decision: 'archive_only_noindex',
      blocked_reasons: reasons.length ? reasons : ['archive_only_noindex'],
    },
    qualityGateBlocked: true,
    qualityGateReason: failureReasons.join(', '),
  };
}

function sourceSignalArticle(article = {}, failureReasons = []) {
  const sourceUrl = safeSourceUrlFor(article);
  const extraction = sourceExtractionPassesPublicGate(article);
  const {
    blog_metadata: _blogMetadata,
    blog_route: _blogRoute,
    deck: _deck,
    expertLens: _expertLens,
    expertLensFull: _expertLensFull,
    expertLensShort: _expertLensShort,
    excerpt: _excerpt,
    infrastructure_relevance: priorInfrastructureRelevance = {},
    infrastructure_relevance_tier: _infrastructureRelevanceTier,
    infrastructure_relevance_action: _infrastructureRelevanceAction,
    infrastructureRelevanceAction: _infrastructureRelevanceActionCamel,
    primaryHref: _primaryHref,
    publicArticleContract: _publicArticleContract,
    public_presentation: priorPresentation = {},
    public_routing: _publicRouting,
    publishing_route: _publishingRoute,
    searchText: _searchText,
    snippet: _snippet,
    summary: _summary,
    why_it_matters: _whyItMatters,
    ...signalBase
  } = withoutLegacyLongformMetadata(article);
  const route = routeStrictInfrastructureRelevance(signalBase);
  if (!sourceUrl || !extraction.ok || route.visibility === 'archive') return null;

  const candidate = {
    ...signalBase,
    public_status: 'signal',
    public_content_tier: 'signal_card',
    homepagePublished: true,
    articlePagePublished: false,
    signalCardOnly: true,
    archiveOnly: false,
    quarantined: false,
    noindex: false,
    seo_noindex: false,
    seo_noindex_reasons: [],
    qualityGateBlocked: false,
    qualityGateReason: '',
    localArticleQualityBlocked: true,
    localArticleQualityReasons: failureReasons,
    blog_route: 'source_signal',
    publishing_route: 'Source Signal',
    primaryHref: sourceUrl,
    routing_decision: 'source_signal',
    generation_version: 'source_signal_repair_v1',
    repetition_blocked: false,
    repetition_block_reasons: [],
    infrastructure_relevance_tier: 'signal_card',
    infrastructure_relevance_action: 'publish_signal_card_only',
    infrastructureRelevanceAction: 'publish_signal_card_only',
    infrastructure_relevance: {
      ...sanitizedInfrastructureRelevance(priorInfrastructureRelevance),
      infrastructure_relevance_tier: 'signal_card',
      infrastructure_relevance_action: 'publish_signal_card_only',
      infrastructureRelevanceAction: 'publish_signal_card_only',
      articlePagePublished: false,
      homepagePublished: true,
      archiveOnly: false,
    },
    public_routing: {
      ...route,
      routing_decision: 'source_signal',
      blocked_reasons: [],
    },
  };
  const copy = generateCardCopy(candidate);
  if (!cardCopyQualityResult(copy, candidate).ok) return null;

  return {
    ...candidate,
    deck: copy.deck,
    summary: copy.deck,
    snippet: copy.deck,
    excerpt: copy.deck,
    why_it_matters: copy.why_it_matters,
    expertLensShort: copy.deck,
    expertLens: copy.deck,
    searchText: [copy.title, copy.source, copy.category, copy.deck, copy.why_it_matters].filter(Boolean).join(' '),
    public_presentation: {
      ...(priorPresentation.image ? { image: priorPresentation.image } : {}),
      ...(priorPresentation.image_alt ? { image_alt: priorPresentation.image_alt } : {}),
      ...(priorPresentation.reader_impact ? { reader_impact: priorPresentation.reader_impact } : {}),
      ...(priorPresentation.region ? { region: priorPresentation.region } : {}),
      ...(priorPresentation.id ? { id: priorPresentation.id } : {}),
      signal_label: copy.signal_label,
      title: copy.title,
      deck: copy.deck,
      why_it_matters: copy.why_it_matters,
      source: copy.source,
      view_detail: '',
      read_source: sourceUrl,
      lane_key: route.laneKey,
      lane_title: route.laneTitle,
      visibility: route.visibility,
      editorial_lens: route.editorial_lens,
      story_archetype: route.story_archetype,
    },
  };
}

export function repairPublicLongformRecord(article = {}, options = {}) {
  if (article.id === CURATED_ARTICLE_ID) return curatedArticle(article, options.recentRecords || []);
  const staleFullMemoLifecycle = hasStaleFullMemoLifecycle(article);
  const staleArchivedLifecycle = claimsArchiveOnly(article) && !hasCanonicalArchiveLifecycle(article);
  const existingFailureReasons = article.public_status === 'signal'
    && Array.isArray(article.localArticleQualityReasons)
    && article.localArticleQualityReasons.length > 0
    ? article.localArticleQualityReasons
    : [];
  const detectedFailureReasons = existingFailureReasons.length > 0
    ? existingFailureReasons
    : publicLongformFailureReasons(article);
  const failureReasons = detectedFailureReasons.length > 0
    ? detectedFailureReasons
    : staleFullMemoLifecycle
      ? [staleArchivedLifecycle ? 'legacy_archive_lifecycle_mismatch' : 'legacy_signal_lifecycle_mismatch']
      : [];
  if ((!claimsPublicLongform(article) && !isLegacyLongformRepair(article)) || failureReasons.length === 0) return article;
  if (staleArchivedLifecycle) return archivedLegacyArticle(article, failureReasons);
  const sourceSignal = sourceSignalArticle(article, failureReasons);
  if (sourceSignal) return sourceSignal;
  return archivedLegacyArticle(article, failureReasons);
}

export function repairPublicLongformRecords(records = []) {
  const recentRecords = records.map((record) => {
    const failedLongform = isLegacyLongformRepair(record)
      || (claimsPublicLongform(record) && publicLongformFailureReasons(record).length > 0);
    if (!failedLongform) return record;
    return {
      id: record.id,
      publishedAt: record.publishedAt,
      articlePagePublished: true,
      archiveOnly: false,
      articleText: record.articleText || record.rawText || record.cleaned_source_text || '',
      article_blueprint: record.article_blueprint,
      articleBlueprint: record.articleBlueprint,
      generation_version: record.generation_version,
      narrative_dna: record.narrative_dna,
    };
  });
  return records.map((record) => {
    const repaired = repairPublicLongformRecord(record, { recentRecords });
    return isDeepStrictEqual(repaired, record) ? record : repaired;
  });
}

const jsonText = (value) => `${JSON.stringify(value, null, 2)}\n`;
const digest = (value) => crypto.createHash('sha256').update(value).digest('hex');

async function readInventoryFile(filePath) {
  const text = await fs.readFile(filePath, 'utf8');
  const records = JSON.parse(text);
  if (!Array.isArray(records)) throw new TypeError(`${filePath} must contain a JSON array`);
  return { path: filePath, text, records };
}

function validateTransformation(input, output, label) {
  if (input.length !== output.length) throw new Error(`${label} record count changed`);
  for (let index = 0; index < input.length; index += 1) {
    if (input[index]?.id !== output[index]?.id) throw new Error(`${label} record order changed at index ${index}`);
  }
}

export async function planPublicLongformInventory(options = {}) {
  const paths = { ...DEFAULT_PATHS, ...(options.paths || {}) };
  const entries = {};
  for (const [label, filePath] of Object.entries(paths)) {
    const input = await readInventoryFile(filePath);
    const outputRecords = repairPublicLongformRecords(input.records);
    validateTransformation(input.records, outputRecords, label);
    entries[label] = {
      ...input,
      outputRecords,
      outputText: jsonText(outputRecords),
    };
  }

  const sourceRecords = [...entries.latest.records, ...entries.archived.records];
  const outputRecords = [...entries.latest.outputRecords, ...entries.archived.outputRecords];
  const changed = Object.values(entries).flatMap((entry) => entry.records.flatMap((record, index) => {
    const next = entry.outputRecords[index];
    return jsonText(record) === jsonText(next) ? [] : [{
      id: record.id,
      from: record.public_status || '',
      to: next.public_status || '',
    }];
  }));
  const inputDigest = digest(Object.values(entries).map((entry) => entry.text).join('\n'));
  return {
    version: MIGRATION_VERSION,
    paths,
    entries,
    inputDigest,
    changed,
    summary: {
      total: outputRecords.length,
      changedRecords: changed.length,
      publicLongforms: outputRecords.filter((article) => article.articlePagePublished === true).length,
      sourceSignals: outputRecords.filter((article) => article.public_status === 'signal').length,
      downgradedToSourceSignal: outputRecords.filter((article, index) => (
        sourceRecords[index]?.articlePagePublished === true || isLegacyLongformRepair(sourceRecords[index])
      ) && article.public_status === 'signal').length,
      curatedArticleId: CURATED_ARTICLE_ID,
    },
  };
}

async function atomicWrite(filePath, content) {
  const tempPath = `${filePath}.${process.pid}.tmp`;
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(tempPath, content, 'utf8');
  JSON.parse(await fs.readFile(tempPath, 'utf8'));
  await fs.rename(tempPath, filePath);
}

export async function applyPublicLongformInventoryPlan(plan, options = {}) {
  if (!plan || plan.version !== MIGRATION_VERSION) throw new Error('invalid public longform migration plan');
  const stamp = String(options.timestamp || new Date().toISOString()).replace(/[:.]/g, '-');
  const artifactRoot = options.artifactRoot || path.join('.cache', 'migrations', MIGRATION_VERSION);
  const artifactDir = path.join(artifactRoot, `${stamp}-${plan.inputDigest.slice(0, 12)}`);
  const write = options.atomicWrite || atomicWrite;
  for (const entry of Object.values(plan.entries)) {
    const currentText = await fs.readFile(entry.path, 'utf8');
    if (digest(currentText) !== digest(entry.text)) {
      throw new Error(`inventory changed after planning: ${entry.path}`);
    }
  }
  await fs.mkdir(artifactDir, { recursive: true });

  const files = {};
  for (const [label, entry] of Object.entries(plan.entries)) {
    const beforePath = path.join(artifactDir, `${label}.before.json`);
    const afterPath = path.join(artifactDir, `${label}.after.json`);
    await fs.writeFile(beforePath, entry.text, 'utf8');
    await fs.writeFile(afterPath, entry.outputText, 'utf8');
    JSON.parse(await fs.readFile(beforePath, 'utf8'));
    JSON.parse(await fs.readFile(afterPath, 'utf8'));
    files[label] = {
      target: path.resolve(entry.path),
      before: path.basename(beforePath),
      after: path.basename(afterPath),
      beforeSha256: digest(entry.text),
      afterSha256: digest(entry.outputText),
    };
  }
  const manifest = {
    version: MIGRATION_VERSION,
    createdAt: new Date().toISOString(),
    inputDigest: plan.inputDigest,
    summary: plan.summary,
    files,
  };
  const manifestPath = path.join(artifactDir, 'manifest.json');
  await fs.writeFile(manifestPath, jsonText(manifest), 'utf8');

  try {
    for (const [label, entry] of Object.entries(plan.entries)) {
      await write(entry.path, entry.outputText, { label, phase: 'apply' });
    }
  } catch (error) {
    for (const [label, entry] of Object.entries(plan.entries)) {
      await atomicWrite(entry.path, entry.text, { label, phase: 'restore' });
    }
    throw error;
  }
  return { ...plan.summary, applied: true, artifactDir, manifestPath };
}

function safeSnapshotPath(artifactDir, snapshotName = '') {
  if (!snapshotName || path.basename(snapshotName) !== snapshotName) {
    throw new Error(`invalid rollback snapshot name: ${snapshotName}`);
  }
  const snapshotPath = path.resolve(artifactDir, snapshotName);
  if (!snapshotPath.startsWith(`${path.resolve(artifactDir)}${path.sep}`)) {
    throw new Error(`rollback snapshot escapes artifact directory: ${snapshotName}`);
  }
  return snapshotPath;
}

export async function rollbackPublicLongformInventory(manifestPath, options = {}) {
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  if (manifest.version !== MIGRATION_VERSION) throw new Error('unsupported public longform migration manifest');
  const artifactDir = path.dirname(manifestPath);
  const expectedPaths = { ...DEFAULT_PATHS, ...(options.paths || {}) };
  const expectedLabels = Object.keys(DEFAULT_PATHS).sort();
  const manifestFiles = manifest.files;
  if (!manifestFiles || typeof manifestFiles !== 'object' || Array.isArray(manifestFiles)) {
    throw new Error('rollback manifest files must be an object');
  }
  const actualLabels = Object.keys(manifestFiles).sort();
  if (!isDeepStrictEqual(actualLabels, expectedLabels)) {
    throw new Error(`rollback manifest inventory keys mismatch: ${actualLabels.join(',')}`);
  }
  const seenTargets = new Set();
  const rollbackFiles = [];
  for (const label of expectedLabels) {
    const file = manifestFiles[label];
    const target = path.resolve(file.target || '');
    const expectedTarget = path.resolve(expectedPaths[label]);
    if (target !== expectedTarget) throw new Error(`rollback target does not match ${label}: ${file.target}`);
    if (seenTargets.has(target)) throw new Error(`duplicate rollback target: ${file.target}`);
    seenTargets.add(target);
    if (file.before !== `${label}.before.json` || file.after !== `${label}.after.json`) {
      throw new Error(`rollback snapshot names do not match ${label}`);
    }
    if (!/^[a-f0-9]{64}$/.test(file.beforeSha256 || '') || !/^[a-f0-9]{64}$/.test(file.afterSha256 || '')) {
      throw new Error(`invalid rollback checksum for ${label}`);
    }
    const beforeText = await fs.readFile(safeSnapshotPath(artifactDir, file.before), 'utf8');
    if (digest(beforeText) !== file.beforeSha256) throw new Error(`rollback snapshot checksum mismatch: ${file.before}`);
    const afterText = await fs.readFile(safeSnapshotPath(artifactDir, file.after), 'utf8');
    if (digest(afterText) !== file.afterSha256) throw new Error(`rollback snapshot checksum mismatch: ${file.after}`);
    const currentText = await fs.readFile(target, 'utf8');
    const currentSha256 = digest(currentText);
    if (![file.beforeSha256, file.afterSha256].includes(currentSha256)) {
      throw new Error(`rollback target changed after migration: ${file.target}`);
    }
    rollbackFiles.push({ target, beforeText, needsRestore: currentSha256 === file.afterSha256 });
  }
  for (const file of rollbackFiles) {
    if (file.needsRestore) await atomicWrite(file.target, file.beforeText);
  }
  return { rolledBack: true, manifestPath };
}

export async function repairPublicLongformInventory(options = {}) {
  const plan = await planPublicLongformInventory(options);
  if (options.apply !== true) return { ...plan.summary, applied: false, inputDigest: plan.inputDigest };
  return applyPublicLongformInventoryPlan(plan, options);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const rollbackIndex = process.argv.indexOf('--rollback');
  const result = rollbackIndex >= 0
    ? await rollbackPublicLongformInventory(process.argv[rollbackIndex + 1])
    : await repairPublicLongformInventory({ apply: process.argv.includes('--apply') });
  console.log(JSON.stringify(result, null, 2));
}
