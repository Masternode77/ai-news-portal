
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
      
      const items = feedData.items.map(item => {
        let imageUrl = null;
        
        // Strategy 1: Enclosure (standard podcast/media)
        if (item.enclosure && item.enclosure.url && item.enclosure.type && item.enclosure.type.startsWith('image')) {
          imageUrl = item.enclosure.url;
        }
        // Strategy 2: Media RSS extension (common in news feeds)
        else if (item['media:content'] && item['media:content'].$ && item['media:content'].$.url) {
          imageUrl = item['media:content'].$.url;
        }
        else if (item['media:thumbnail'] && item['media:thumbnail'].$ && item['media:thumbnail'].$.url) {
          imageUrl = item['media:thumbnail'].$.url;
        }
        // Strategy 3: HTML Content parsing (find first <img> tag)
        else if (item['content:encoded'] || item.content) {
          const htmlContent = item['content:encoded'] || item.content;
          const imgMatch = htmlContent.match(/<img[^>]+src=["']([^"']+)["']/);
          if (imgMatch) {
            imageUrl = imgMatch[1];
          }
        }

        return {
          source: feed.source,
          title: item.title,
          url: item.link,
          summary: item.contentSnippet || item.contentSnippet || '',
          publishedAt: item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString(),
          image: imageUrl
        };
      });

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
