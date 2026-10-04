import { readFileSync } from 'node:fs';
export const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
export const REFRESH_INTERVAL_HOURS = Number(process.env.REFRESH_INTERVAL_HOURS || 8);

export const MAX_ITEMS_FETCHED = Number(process.env.MAX_ITEMS_FETCHED || 30);
export const MIN_ITEMS_PER_SOURCE_IN_POOL = Number(process.env.MIN_ITEMS_PER_SOURCE_IN_POOL || 1);
export const MAX_ITEMS_PER_SOURCE_IN_POOL = Number(process.env.MAX_ITEMS_PER_SOURCE_IN_POOL || 6);
export const POOL_MAX_AGE_DAYS = Number(process.env.POOL_MAX_AGE_DAYS || 10);
export const PIPELINE_FORCE_SLOT = process.env.PIPELINE_FORCE_SLOT === '1';
// Daily throughput: each run processes up to three curated items. The daily
// target caps what reaches a public surface (an article page or a signal card)
// per KST day; a pick the relevance gate files as archive-only does not use
// it, so a thin morning cannot close the day. DAILY_PROCESSING_LIMIT caps
// everything processed per day, so repeated manual runs on one day cannot
// exhaust the candidate pool or the model budget.
export const DAILY_CURATION_TARGET = Number(process.env.DAILY_CURATION_TARGET || 9);
export const DAILY_PROCESSING_LIMIT = Number(process.env.DAILY_PROCESSING_LIMIT || 18);
export const ITEMS_PER_RUN = Number(process.env.ITEMS_PER_RUN || 3);
export const FRESH_CANDIDATE_WINDOW_HOURS = Number(process.env.FRESH_CANDIDATE_WINDOW_HOURS || 24);
// Older on-beat items stay eligible behind the fresh ones for a week.
export const CANDIDATE_MAX_AGE_HOURS = Number(process.env.CANDIDATE_MAX_AGE_HOURS || 168);
// When the curation model returns fewer picks than the floor, the
// deterministic ranker tops the plan up with on-beat items (either lane at or
// above the minimum relevance). Downstream relevance, extraction, quality and
// repetition gates still decide what each pick becomes.
export const CURATION_FLOOR = Number(process.env.CURATION_FLOOR ?? 3);
export const CURATION_FLOOR_MIN_RELEVANCE = Number(process.env.CURATION_FLOOR_MIN_RELEVANCE || 0.55);
export const LATEST_NEWS_LIMIT = Number(process.env.LATEST_NEWS_LIMIT || 30);
export const EXPERT_LENS_VERSION = Number(process.env.EXPERT_LENS_VERSION || 2);
export const PIPELINE_USE_EXISTING_POOL = process.env.PIPELINE_USE_EXISTING_POOL === '1';
export const PIPELINE_OFFLINE =
  process.env.PIPELINE_OFFLINE === '1' || process.env.CODEX_SANDBOX_NETWORK_DISABLED === '1';

export const IMAGE_PROVIDER = process.env.IMAGE_PROVIDER || 'codex';
export const CHATGPT_IMAGE_OAUTH_ENDPOINT = process.env.CHATGPT_IMAGE_OAUTH_ENDPOINT || '';
export const CHATGPT_IMAGE_OAUTH_ACCESS_TOKEN = process.env.CHATGPT_IMAGE_OAUTH_ACCESS_TOKEN || '';
export const OPENAI_IMAGE_API_URL = process.env.OPENAI_IMAGE_API_URL || 'https://api.openai.com/v1/images/generations';
export const OPENAI_IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2';
export const OPENAI_IMAGE_SIZE = process.env.OPENAI_IMAGE_SIZE || '1536x1024';
export const OPENAI_IMAGE_QUALITY = process.env.OPENAI_IMAGE_QUALITY || 'medium';

export const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
// Defaults are deliberately long-lived catalog ids; production should pin the
// preferred models via env/secrets. Unknown-model errors surface loudly in
// logs and trigger the fallback chain instead of silently degrading.
export const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini';
// Story curation runs on the newest general-purpose OpenAI GPT model. The
// monthly curation-model-refresh workflow keeps config/curation-model.json
// current; CURATION_MODEL pins a model over it. An unavailable id falls back
// to OPENROUTER_MODEL once before the deterministic ranker takes over.
function configuredCurationModel() {
  try {
    const parsed = JSON.parse(readFileSync(new URL('../../config/curation-model.json', import.meta.url), 'utf8'));
    return typeof parsed?.model === 'string' && parsed.model.trim() ? parsed.model.trim() : '';
  } catch {
    return '';
  }
}
export const CURATION_MODEL = process.env.CURATION_MODEL || configuredCurationModel() || 'openai/gpt-5.6-sol';
export const OPENROUTER_SITE_URL = process.env.OPENROUTER_SITE_URL || '';
export const OPENROUTER_APP_TITLE = process.env.OPENROUTER_APP_TITLE || 'Compute Current';
export const EXPERT_LENS_MODEL = process.env.EXPERT_LENS_MODEL || 'anthropic/claude-sonnet-4.5';
export const EXPERT_LENS_FALLBACK_MODEL = process.env.EXPERT_LENS_FALLBACK_MODEL || 'openai/gpt-4o';
export const AUTHORED_COLUMN_MODEL = process.env.AUTHORED_COLUMN_MODEL || EXPERT_LENS_MODEL;

export const GEMINI_API_URL = process.env.GEMINI_API_URL || 'https://generativelanguage.googleapis.com/v1beta/models';
export const GEMINI_IMAGE_MODEL = process.env.GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image';

export const PIPELINE_STATE_PATH = 'scripts/state/pipeline-state.json';
export const LATEST_NEWS_PATH = 'src/data/latest-news.json';
export const NEWS_POOL_PATH = 'src/data/news-pool.json';
export const ARCHIVE_NEWS_PATH = 'src/data/archived-news.json';
export const SEARCH_INDEX_PATH = 'src/data/search-index.json';
export const TAXONOMY_PAGES_PATH = 'src/data/taxonomy-pages.json';
export const AUTHORED_COLUMNS_PATH = 'src/data/authored-columns.json';

export const AUTHORED_COLUMN_ENABLED = (process.env.AUTHORED_COLUMN_ENABLED ?? '1') !== '0';
export const AUTHORED_COLUMNS_PER_DAY = Number(process.env.AUTHORED_COLUMNS_PER_DAY || 3);
export const AUTHORED_COLUMN_MIN_GAP_HOURS = Number(process.env.AUTHORED_COLUMN_MIN_GAP_HOURS || 4);

export const SUPABASE_URL = process.env.SUPABASE_URL || '';
export const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
export const SUPABASE_ARCHIVE_TABLE = process.env.SUPABASE_ARCHIVE_TABLE || 'archived_articles';

export const CATEGORIES = [
  'Hyperscalers & Cloud',
  'Colocation & Wholesale',
  'AI Infrastructure (GPU/Neocloud)',
  'Power / Grid / Energy',
  'Cooling / MEP / Engineering',
  'Market / M&A / Financing',
  'APAC + Policy/Regulation',
];

export const CATEGORY_KEYWORDS = {
  'Hyperscalers & Cloud': ['aws', 'azure', 'google cloud', 'oracle cloud', 'cloud', 'hyperscale', 'region', 'availability zone'],
  'Colocation & Wholesale': ['colocation', 'colo', 'wholesale', 'lease', 'campus', 'carrier hotel', 'operator'],
  'AI Infrastructure (GPU/Neocloud)': ['ai', 'gpu', 'nvidia', 'amd', 'training', 'inference', 'neocloud', 'cluster', 'hbm'],
  'Power / Grid / Energy': ['power', 'grid', 'substation', 'utility', 'energy', 'transformer', 'ppa', 'renewable'],
  'Cooling / MEP / Engineering': ['cooling', 'liquid cooling', 'mep', 'mechanical', 'thermal', 'cdus', 'rack density', 'rear-door'],
  'Market / M&A / Financing': ['acquisition', 'merger', 'funding', 'equity', 'debt', 'valuation', 'ipo', 'joint venture'],
  'APAC + Policy/Regulation': ['apac', 'korea', 'japan', 'singapore', 'malaysia', 'india', 'regulation', 'policy', 'permit'],
};

export const REGION_HINTS = {
  Korea: ['korea', 'seoul', 'busan', 'incheon', 'kepco'],
  APAC: ['singapore', 'malaysia', 'japan', 'india', 'australia', 'indonesia', 'thailand', 'taiwan', 'apac'],
  US: ['united states', 'u.s.', 'us', 'texas', 'virginia', 'arizona', 'oregon'],
  EU: ['europe', 'eu', 'france', 'germany', 'netherlands', 'ireland', 'spain', 'italy', 'uk', 'united kingdom'],
  MiddleEast: ['uae', 'saudi', 'qatar', 'oman', 'bahrain'],
};

export const RELEVANCE_KEYWORDS = [
  'artificial intelligence',
  'ai',
  'machine learning',
  'llm',
  'gpu',
  'nvidia',
  'amd',
  'semiconductor',
  'chip',
  'data center',
  'datacenter',
  'cloud',
  'rack',
  'cooling',
  'grid',
  'power',
  'campus',
  'hyperscale',
  'colocation',
  'hbm',
  'inference',
  'training',
];

export const FEEDS = [
  {
    source: 'SiliconANGLE AI',
    url: 'https://siliconangle.com/category/ai/feed/',
    region: 'Global',
    language: 'en',
    defaultCategory: 'AI Infrastructure (GPU/Neocloud)',
  },
  {
    source: 'Bloomberg Technology',
    url: 'https://feeds.bloomberg.com/technology/news.rss',
    region: 'Global',
    language: 'en',
    defaultCategory: 'Hyperscalers & Cloud',
  },
  {
    source: 'NVIDIA Blog',
    url: 'https://blogs.nvidia.com/feed/',
    region: 'Global',
    language: 'en',
    defaultCategory: 'AI Infrastructure (GPU/Neocloud)',
  },
  {
    source: 'Google Cloud Blog',
    url: 'https://cloudblog.withgoogle.com/rss/',
    region: 'Global',
    language: 'en',
    defaultCategory: 'Hyperscalers & Cloud',
  },
  {
    source: 'AWS News Blog',
    url: 'https://aws.amazon.com/blogs/aws/feed/',
    region: 'Global',
    language: 'en',
    defaultCategory: 'Hyperscalers & Cloud',
  },
  {
    source: 'Microsoft Azure Blog',
    url: 'https://azure.microsoft.com/en-us/blog/feed/',
    region: 'Global',
    language: 'en',
    defaultCategory: 'Hyperscalers & Cloud',
  },
  {
    source: 'TechCrunch AI',
    url: 'https://techcrunch.com/category/artificial-intelligence/feed/',
    region: 'Global',
    language: 'en',
    defaultCategory: 'AI Infrastructure (GPU/Neocloud)',
  },
  {
    source: 'VentureBeat AI',
    url: 'https://venturebeat.com/category/ai/feed/',
    region: 'Global',
    language: 'en',
    defaultCategory: 'AI Infrastructure (GPU/Neocloud)',
  },
  {
    source: 'The Register Data Centre',
    url: 'https://www.theregister.com/data_centre/headlines.atom',
    region: 'Global',
    language: 'en',
    defaultCategory: 'Colocation & Wholesale',
  },
  {
    source: 'Data Center Dynamics',
    url: 'https://www.datacenterdynamics.com/en/rss/',
    region: 'Global',
    language: 'en',
    defaultCategory: 'Colocation & Wholesale',
  },
  {
    source: 'Data Center Knowledge',
    url: 'https://www.datacenterknowledge.com/rss.xml',
    region: 'Global',
    language: 'en',
    defaultCategory: 'Colocation & Wholesale',
  },
  {
    source: 'ServeTheHome',
    url: 'https://www.servethehome.com/feed/',
    region: 'Global',
    language: 'en',
    defaultCategory: 'AI Infrastructure (GPU/Neocloud)',
  },
  {
    source: 'Toms Hardware',
    url: 'https://www.tomshardware.com/feeds/all',
    region: 'Global',
    language: 'en',
    defaultCategory: 'AI Infrastructure (GPU/Neocloud)',
  },
  {
    source: 'StorageReview',
    url: 'https://www.storagereview.com/feed',
    region: 'Global',
    language: 'en',
    defaultCategory: 'AI Infrastructure (GPU/Neocloud)',
  },
  {
    source: 'Semiconductor Engineering',
    url: 'https://semiengineering.com/feed/',
    region: 'Global',
    language: 'en',
    defaultCategory: 'AI Infrastructure (GPU/Neocloud)',
  },
  {
    source: 'Data Center Frontier',
    url: 'https://www.datacenterfrontier.com/__rss/website-scheduled-content.xml?input=%7B%22sectionAlias%22%3A%22home%22%7D',
    region: 'Global',
    language: 'en',
    defaultCategory: 'Colocation & Wholesale',
  },
  {
    source: 'Data Center POST',
    url: 'https://datacenterpost.com/feed/',
    region: 'Global',
    language: 'en',
    defaultCategory: 'Colocation & Wholesale',
  },
  {
    source: 'Cloudflare Blog',
    url: 'https://blog.cloudflare.com/rss',
    region: 'Global',
    language: 'en',
    defaultCategory: 'Hyperscalers & Cloud',
  },
  {
    source: 'Engineering at Meta',
    url: 'https://engineering.fb.com/feed/',
    region: 'Global',
    language: 'en',
    defaultCategory: 'Hyperscalers & Cloud',
  },
  {
    source: 'Hugging Face Blog',
    url: 'https://huggingface.co/blog/feed.xml',
    region: 'Global',
    language: 'en',
    defaultCategory: 'AI Infrastructure (GPU/Neocloud)',
  },
  {
    source: 'Uptime Institute Journal',
    url: 'https://journal.uptimeinstitute.com/feed/',
    region: 'Global',
    language: 'en',
    defaultCategory: 'Colocation & Wholesale',
  },
  {
    source: 'HPCwire',
    url: 'https://www.hpcwire.com/feed/',
    region: 'Global',
    language: 'en',
    defaultCategory: 'AI Infrastructure (GPU/Neocloud)',
  },
  {
    source: 'insideHPC',
    url: 'https://insidehpc.com/feed/',
    region: 'Global',
    language: 'en',
    defaultCategory: 'AI Infrastructure (GPU/Neocloud)',
  },
  {
    source: 'Blocks & Files',
    url: 'https://blocksandfiles.com/feed/',
    region: 'Global',
    language: 'en',
    defaultCategory: 'AI Infrastructure (GPU/Neocloud)',
  },
  {
    source: 'Utility Dive',
    url: 'https://www.utilitydive.com/feeds/news/',
    region: 'US',
    language: 'en',
    defaultCategory: 'Power / Grid / Energy',
  },
  {
    source: 'Power Engineering',
    url: 'https://www.power-eng.com/feed/',
    region: 'Global',
    language: 'en',
    defaultCategory: 'Power / Grid / Energy',
  },
  {
    source: 'Capacity Media',
    url: 'https://www.capacitymedia.com/feed/',
    region: 'Global',
    language: 'en',
    defaultCategory: 'Hyperscalers & Cloud',
  }
];
