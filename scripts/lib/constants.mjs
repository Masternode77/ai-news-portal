export const MAX_ITEMS_FETCHED = 30;
export const DAILY_CURATION_TARGET = 6;
export const ITEMS_PER_RUN = 2;

export const FEEDS = [
  { source: 'Reuters Technology', url: 'https://www.reutersagency.com/feed/?best-topics=technology' },
  { source: 'Bloomberg Technology', url: 'https://feeds.bloomberg.com/technology/news.rss' },
  { source: 'NVIDIA Blog', url: 'https://blogs.nvidia.com/blog/feed/' },
  { source: 'Google Cloud Blog', url: 'https://cloud.google.com/blog/topics/infrastructure/rss/' },
  { source: 'Microsoft Azure Blog', url: 'https://azure.microsoft.com/en-us/blog/feed/' },
  { source: 'AWS News Blog', url: 'https://aws.amazon.com/blogs/aws/feed/' },
  { source: 'TechCrunch AI', url: 'https://techcrunch.com/category/artificial-intelligence/feed/' },
  { source: 'VentureBeat AI', url: 'https://venturebeat.com/category/ai/feed/' },
  { source: 'The Register Data Centre', url: 'https://www.theregister.com/data_centre/headlines.atom' },
  { source: 'Data Center Dynamics', url: 'https://www.datacenterdynamics.com/en/rss/' },
  { source: 'Data Center Knowledge', url: 'https://www.datacenterknowledge.com/rss.xml' },
  { source: 'Toms Hardware', url: 'https://www.tomshardware.com/feeds/all' },
  { source: 'AnandTech', url: 'https://www.anandtech.com/rss/' },
  { source: 'Semiconductor Engineering', url: 'https://semiengineering.com/feed/' },
];

export const RELEVANCE_KEYWORDS = [
  'artificial intelligence',
  'ai',
  'machine learning',
  'llm',
  'inference',
  'training',
  'gpu',
  'cuda',
  'npu',
  'asic',
  'semiconductor',
  'chip',
  'wafer',
  'fab',
  'tsmc',
  'nvidia',
  'amd',
  'intel',
  'broadcom',
  'arm',
  'hyperscale',
  'cloud',
  'kubernetes',
  'server',
  'data center',
  'datacenter',
  'rack',
  'liquid cooling',
  'edge computing',
  'network',
  'power',
  'grid',
  'hbm',
  'euv',
];

export const PIPELINE_STATE_PATH = 'scripts/state/pipeline-state.json';
export const LATEST_NEWS_PATH = 'src/data/latest-news.json';
export const NEWS_POOL_PATH = 'src/data/news-pool.json';

export const GEMINI_IMAGE_MODEL = process.env.GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image-preview';
