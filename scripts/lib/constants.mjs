export const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
export const REFRESH_INTERVAL_HOURS = Number(process.env.REFRESH_INTERVAL_HOURS || 8);

export const MAX_ITEMS_FETCHED = Number(process.env.MAX_ITEMS_FETCHED || 30);
export const DAILY_CURATION_TARGET = Number(process.env.DAILY_CURATION_TARGET || 6);
export const ITEMS_PER_RUN = Number(process.env.ITEMS_PER_RUN || 2);
export const LATEST_NEWS_LIMIT = Number(process.env.LATEST_NEWS_LIMIT || 30);
export const EXPERT_LENS_VERSION = Number(process.env.EXPERT_LENS_VERSION || 2);
export const PIPELINE_USE_EXISTING_POOL = process.env.PIPELINE_USE_EXISTING_POOL === '1';
export const PIPELINE_OFFLINE =
  process.env.PIPELINE_OFFLINE === '1' || process.env.CODEX_SANDBOX_NETWORK_DISABLED === '1';

export const IMAGE_PROVIDER = process.env.IMAGE_PROVIDER || 'chatgpt';
export const CHATGPT_IMAGE_OAUTH_ENDPOINT = process.env.CHATGPT_IMAGE_OAUTH_ENDPOINT || '';
export const CHATGPT_IMAGE_OAUTH_ACCESS_TOKEN = process.env.CHATGPT_IMAGE_OAUTH_ACCESS_TOKEN || '';
export const OPENAI_IMAGE_API_URL = process.env.OPENAI_IMAGE_API_URL || 'https://api.openai.com/v1/images/generations';
export const OPENAI_IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1';
export const OPENAI_IMAGE_SIZE = process.env.OPENAI_IMAGE_SIZE || '1536x1024';
export const OPENAI_IMAGE_QUALITY = process.env.OPENAI_IMAGE_QUALITY || 'medium';

export const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
export const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'openai/gpt-5.3-codex';
export const OPENROUTER_SITE_URL = process.env.OPENROUTER_SITE_URL || '';
export const OPENROUTER_APP_TITLE = process.env.OPENROUTER_APP_TITLE || 'AI / Data Center Signal Board';
export const EXPERT_LENS_MODEL = process.env.EXPERT_LENS_MODEL || 'openai/gpt-5.4';
export const EXPERT_LENS_FALLBACK_MODEL = process.env.EXPERT_LENS_FALLBACK_MODEL || OPENROUTER_MODEL;

export const GEMINI_API_URL = process.env.GEMINI_API_URL || 'https://generativelanguage.googleapis.com/v1beta/models';
export const GEMINI_IMAGE_MODEL = process.env.GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image';

export const PIPELINE_STATE_PATH = 'scripts/state/pipeline-state.json';
export const LATEST_NEWS_PATH = 'src/data/latest-news.json';
export const NEWS_POOL_PATH = 'src/data/news-pool.json';
export const ARCHIVE_NEWS_PATH = 'src/data/archived-news.json';
export const SEARCH_INDEX_PATH = 'src/data/search-index.json';

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
    source: 'Reuters Technology',
    url: 'https://www.reutersagency.com/feed/?best-topics=technology',
    region: 'Global',
    language: 'en',
    defaultCategory: 'Market / M&A / Financing',
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
    url: 'https://blogs.nvidia.com/blog/feed/',
    region: 'Global',
    language: 'en',
    defaultCategory: 'AI Infrastructure (GPU/Neocloud)',
  },
  {
    source: 'Google Cloud Blog',
    url: 'https://cloud.google.com/blog/topics/infrastructure/rss/',
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
    source: 'AnandTech',
    url: 'https://www.anandtech.com/rss/',
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
  }
];
