import { ensureArticleImage } from './lib/image-generator.mjs';
import { describeImageProvider } from './lib/image-providers/index.mjs';

const provider = describeImageProvider();
console.log(`[image-provider] requested=${provider.requested} active=${provider.active} configured=${provider.configured}`);

const imagePath = await ensureArticleImage({
  id: 'phase3-smoke-image',
  title: 'OpenAI image provider smoke test',
  summary: 'Verifies the image provider fallback contract without live credentials.',
  source: 'Local dry run',
  category: 'AI Infrastructure (GPU/Neocloud)',
  forceImageRefresh: true,
  forcePlaceholderImage: true,
});

console.log(`[image-provider] generated=${imagePath}`);
