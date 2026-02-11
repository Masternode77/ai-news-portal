
import Parser from 'rss-parser';
import fs from 'fs/promises';
import path from 'path';

const parser = new Parser();

// RSS Feeds to track
const FEEDS = [
  { source: 'Data Center Knowledge', url: 'https://www.datacenterknowledge.com/rss.xml' },
  { source: 'Data Center Dynamics', url: 'https://www.datacenterdynamics.com/en/rss/' },
  { source: 'TechCrunch AI', url: 'https://techcrunch.com/category/artificial-intelligence/feed/' },
  // Add more as needed
];

async function fetchNews() {
  let allNews = [];

  for (const feed of FEEDS) {
    try {
      console.log(`Fetching ${feed.source}...`);
      const feedData = await parser.parseURL(feed.url);
      
      const items = feedData.items.map(item => ({
        source: feed.source,
        title: item.title,
        url: item.link,
        summary: item.contentSnippet || item.content || '',
        publishedAt: item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString()
      }));

      allNews = [...allNews, ...items];
    } catch (error) {
      console.error(`Error fetching ${feed.source}:`, error.message);
    }
  }

  // Sort by date (newest first)
  allNews.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

  // Deduplicate by URL
  const seen = new Set();
  const uniqueNews = allNews.filter(item => {
    if (seen.has(item.url)) return false;
    seen.add(item.url);
    return true;
  });

  // Limit to top 50
  const topNews = uniqueNews.slice(0, 50);

  // Write to src/data/latest-news.json
  const outputPath = path.join(process.cwd(), 'src/data/latest-news.json');
  await fs.writeFile(outputPath, JSON.stringify(topNews, null, 2));
  console.log(`Successfully updated news with ${topNews.length} items.`);
}

fetchNews();
