import archivedNews from '../data/archived-news.json' with { type: 'json' };
import latestNews from '../data/latest-news.json' with { type: 'json' };
import { articleImageVariants } from '../../scripts/lib/article-image-surface.mjs';
import { safePublicHttpUrl } from './public-url.js';

export const DESIGN_LAB_THEMES = [
  {
    slug: 'midnight-intelligence',
    name: 'Midnight Intelligence',
    shortName: 'Midnight',
    proposition: 'A high-contrast evening edition for infrastructure decisions that cannot wait for consensus.',
  },
  {
    slug: 'research-ledger',
    name: 'Research Ledger',
    shortName: 'Ledger',
    proposition: 'A measured research edition built for close reading, comparison, and source tracing.',
  },
  {
    slug: 'signal-mosaic',
    name: 'Signal Mosaic',
    shortName: 'Mosaic',
    proposition: 'A modular market view that connects power, silicon, cooling, networks, and capital.',
  },
];

const STORY_EDITORIAL = [
  {
    id: '99520a2a1435cecd',
    route: 'Analyst Note',
    lane: 'Data Centers',
    deck: 'A 300 MW lease settles the demand question at Delta Forge 1. The remaining test is whether 430 MW of utility power becomes customer-ready capacity on schedule.',
    decision: 'Track delivery milestones, financing, and rent commencement.',
    metric: '300 MW',
  },
  {
    id: '31c08800182195fe',
    route: 'Editorial Brief',
    lane: 'Power & Grid',
    deck: 'Texas is weighing a 765 kV transmission buildout as large loads reshape the case for new backbone capacity.',
    decision: 'Transmission sequencing now matters to campus location decisions.',
    metric: '765 kV',
  },
  {
    id: '3cfeaad8775dba04',
    image: '/generated/design-lab/cooling-system-survey.png',
    imageAlt: 'Uptime Institute survey comparing adoption preferences across five data center cooling system types.',
    route: 'Original Report',
    lane: 'Cooling',
    deck: 'Fresh investment in two-phase cooling puts the next thermal architecture choice back on the procurement agenda.',
    decision: 'Compare serviceability and supply readiness with cold-plate systems.',
    metric: '2 phase',
  },
  {
    id: '6ce0c25ab1f128ad',
    image: '/generated/design-lab/rapidus-fab.jpg',
    imageAlt: 'Rapidus sign outside the company semiconductor fabrication facility in Hokkaido, Japan.',
    route: 'Editorial Brief',
    lane: 'Semiconductors',
    deck: 'Rapidus has one Hokkaido fab, a 2027 target, and a customer pipeline to convert into qualified leading-edge output.',
    decision: 'Qualification timing is the key buyer checkpoint.',
    metric: '2027',
  },
  {
    id: '44b53955da06abc8',
    route: 'Original Report',
    lane: 'Networks',
    deck: 'Vocus plans a ducted long-haul fibre route between Sydney and Melbourne, adding a new path for future digital infrastructure demand.',
    decision: 'Watch construction timing and customer commitments.',
    metric: '6,912 cores',
  },
  {
    id: '333e44a44ef47956',
    image: '/generated/design-lab/south-korea-compute.jpg',
    imageAlt: 'South Korean flag displayed among office buildings in Seoul.',
    route: 'Original Report',
    lane: 'Compute',
    deck: 'Upstage and AMD are discussing a 10,000-GPU deployment across South Korea, a scale signal rather than a completed capacity addition.',
    decision: 'Separate announced intent from installed and energized systems.',
    metric: '10,000 GPUs',
  },
  {
    id: 'c85154a6e6b0d92d',
    image: '/generated/design-lab/ecolab-headquarters.jpg',
    imageAlt: 'Ecolab headquarters building beneath a clear blue sky.',
    route: 'Market View',
    lane: 'Cooling',
    deck: 'Ecolab argues that data-center cooling demand can endure beyond the present AI investment cycle.',
    decision: 'Test the claim against project starts and cooling retrofit demand.',
    metric: 'Thermal',
  },
  {
    id: 'ee9f9f8e69e8398e',
    route: 'Original Report',
    lane: 'Storage',
    deck: 'Kioxia has begun sampling new flash memory for AI data centers, moving the product into customer evaluation.',
    decision: 'Sampling is the start of qualification, not volume availability.',
    metric: 'Sampling',
  },
];

const records = new Map([...latestNews, ...archivedNews].map((article) => [article.id, article]));

function storyFor(editorial) {
  const article = records.get(editorial.id);
  if (!article) throw new Error(`Missing design-lab article ${editorial.id}`);
  const images = articleImageVariants(article);
  return Object.freeze({
    ...editorial,
    title: article.title,
    source: article.source,
    sourceUrl: safePublicHttpUrl(article.sourceUrl || article.url),
    date: article.publishedAt,
    image: editorial.image || images.thumbnail.url,
    heroImage: images.hero.url,
    imageAlt: editorial.imageAlt || images.hero.alt,
  });
}

export const DESIGN_LAB_STORIES = Object.freeze(STORY_EDITORIAL.map(storyFor));
export const DESIGN_LAB_LEAD = DESIGN_LAB_STORIES[0];

const leadRecord = records.get(DESIGN_LAB_LEAD.id);
const articleBody = String(leadRecord?.expertLensFull?.finalArticleBody || '')
  .split(/\n{2,}/)
  .map((block) => block.trim())
  .filter(Boolean);

export const DESIGN_LAB_ARTICLE = Object.freeze({
  ...DESIGN_LAB_LEAD,
  author: 'Compute Current Research',
  body: articleBody,
  keyData: [
    ['Contracted IT load', '300 MW'],
    ['Utility power design', '430 MW'],
    ['Base lease value', 'About $7.5B'],
    ['Initial operations', 'Mid-2027 target'],
  ],
  limitation: 'The tenant is unnamed, and the disclosure does not provide building-level rent commencement dates or the financing package specific to Delta Forge 1.',
  watchItems: [
    'Building-level construction and energization milestones',
    'Financing terms and required equity',
    'Rack acceptance, rent commencement, and customer deployment timing',
  ],
  bottomLine: 'Contracted megawatts and operating megawatts are not interchangeable. The next evidence must come from delivery, financing, and commissioning milestones.',
});

export const DESIGN_LAB_MARKET_DATA = Object.freeze([
  { label: 'Lead commitment', value: '300 MW', context: 'Delta Forge 1' },
  { label: 'Grid backbone', value: '765 kV', context: 'Texas proposal' },
  { label: 'Compute intent', value: '10K GPUs', context: 'South Korea talks' },
  { label: 'Network scale', value: '6,912', context: 'Potential fibre cores' },
]);

export function designLabTheme(slug = '') {
  return DESIGN_LAB_THEMES.find((theme) => theme.slug === slug) || null;
}
