import Parser from 'rss-parser';
import fs from 'fs/promises';
import path from 'path';

const parser = new Parser();

const FEEDS = [
  { source: 'Data Center Knowledge', url: 'https://www.datacenterknowledge.com/rss.xml' },
  { source: 'Data Center Dynamics', url: 'https://www.datacenterdynamics.com/en/rss/' },
  { source: 'TechCrunch AI', url: 'https://techcrunch.com/category/artificial-intelligence/feed/' },
];

async function fetchNews() {
  let allNews = [];

  for (const feed of FEEDS) {
    try {
      console.log(`Fetching ${feed.source}...`);
      const feedData = await parser.parseURL(feed.url);

      const items = (feedData.items || []).map((item) => {
        let imageUrl = null;

        if (item.enclosure && item.enclosure.url && item.enclosure.type && item.enclosure.type.startsWith('image')) {
          imageUrl = item.enclosure.url;
        } else if (item['media:content'] && item['media:content'].$ && item['media:content'].$.url) {
          imageUrl = item['media:content'].$.url;
        } else if (item['media:thumbnail'] && item['media:thumbnail'].$ && item['media:thumbnail'].$.url) {
          imageUrl = item['media:thumbnail'].$.url;
        } else if (item['content:encoded'] || item.content) {
          const htmlContent = item['content:encoded'] || item.content;
          const imgMatch = htmlContent.match(/<img[^>]+src=["']([^"']+)["']/);
          if (imgMatch) imageUrl = imgMatch[1];
        }

        return {
          source: feed.source,
          title: item.title,
          url: item.link,
          summary: item.contentSnippet || '',
          publishedAt: item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString(),
          image: imageUrl,
        };
      });

      allNews = [...allNews, ...items];
    } catch (error) {
      console.error(`Error fetching ${feed.source}:`, error.message);
    }
  }

  allNews.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

  const seen = new Set();
  const uniqueNews = allNews.filter((item) => {
    if (seen.has(item.url)) return false;
    seen.add(item.url);
    return true;
  });

  const topNews = uniqueNews.slice(0, 50);
  const outputPath = path.join(process.cwd(), 'src/data/latest-news.json');
  await fs.writeFile(outputPath, JSON.stringify(topNews, null, 2));
  console.log(`Successfully updated news with ${topNews.length} items.`);
}

fetchNews();
