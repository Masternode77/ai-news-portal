const COMMON_FEED_PATHS = [
  '/feed/',
  '/feed',
  '/rss/',
  '/rss.xml',
  '/atom.xml',
  '/news/rss',
  '/feeds/news/',
  '/headlines.atom',
];

const COMMON_SITEMAP_PATHS = [
  '/sitemap.xml',
  '/sitemap_index.xml',
  '/news-sitemap.xml',
  '/sitemap-news.xml',
];

function compact(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function looksLikeFeed(text = '') {
  return /<(rss|feed|rdf:RDF)\b/i.test(text) && /<item\b|<entry\b/i.test(text);
}

function looksLikeSitemap(text = '') {
  return /<urlset\b|<sitemapindex\b/i.test(text) && /<loc>/i.test(text);
}

function absoluteUrl(domain = '', maybePath = '') {
  if (/^https?:\/\//i.test(maybePath)) return maybePath;
  const host = domain.replace(/^https?:\/\//, '').replace(/\/$/, '');
  return `https://${host}${maybePath.startsWith('/') ? maybePath : `/${maybePath}`}`;
}

async function fetchText(url, fetcher, timeoutMs = 10000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetcher(url, {
      headers: {
        'User-Agent': 'ComputeCurrentBot/1.0 (+https://www.computecurrent.com/methodology/)',
        Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, text/html;q=0.9,*/*;q=0.5',
      },
      signal: controller.signal,
    });
    const text = await response.text().catch(() => '');
    return { ok: response.ok, status: response.status, text, url };
  } finally {
    clearTimeout(timeout);
  }
}

function alternateFeedLinks(html = '', baseUrl = '') {
  const links = [];
  const pattern = /<link\b[^>]*rel=["'][^"']*alternate[^"']*["'][^>]*>/gi;
  const hrefPattern = /\bhref=["']([^"']+)["']/i;
  for (const match of html.matchAll(pattern)) {
    const tag = match[0];
    if (!/rss|atom|feed|xml/i.test(tag)) continue;
    const href = hrefPattern.exec(tag)?.[1];
    if (!href) continue;
    try {
      links.push(new URL(href, baseUrl).toString());
    } catch {
      // Ignore malformed source markup.
    }
  }
  return links;
}

export async function discoverSourceFeed(source = {}, options = {}) {
  const fetcher = options.fetcher || globalThis.fetch;
  if (typeof fetcher !== 'function') {
    return { source, status: 'blocked', reason: 'fetch_unavailable', discoveredUrl: '' };
  }

  const candidates = [
    source.feed,
    source.atom,
    source.rss,
    ...COMMON_FEED_PATHS.map((feedPath) => absoluteUrl(source.domain, feedPath)),
  ].filter(Boolean);

  const seen = new Set();
  for (const url of candidates) {
    if (seen.has(url)) continue;
    seen.add(url);
    try {
      const response = await fetchText(url, fetcher, options.timeoutMs || 10000);
      if (response.ok && looksLikeFeed(response.text)) {
        return { source, status: 'active_feed', discoveredUrl: url, httpStatus: response.status };
      }
    } catch {
      // Continue through non-aggressive fallback candidates.
    }
  }

  const sitemapCandidates = [
    source.sitemap,
    ...COMMON_SITEMAP_PATHS.map((sitemapPath) => absoluteUrl(source.domain, sitemapPath)),
  ].filter(Boolean);
  for (const url of sitemapCandidates) {
    if (seen.has(url)) continue;
    seen.add(url);
    try {
      const response = await fetchText(url, fetcher, options.timeoutMs || 10000);
      if (response.ok && looksLikeSitemap(response.text)) {
        return { source, status: 'active_sitemap', discoveredUrl: url, httpStatus: response.status };
      }
    } catch {
      // Continue through bounded sitemap candidates.
    }
  }

  const homepageUrl = absoluteUrl(source.domain, '/');
  try {
    const response = await fetchText(homepageUrl, fetcher, options.timeoutMs || 10000);
    if (response.ok) {
      for (const url of alternateFeedLinks(response.text, homepageUrl)) {
        try {
          const feedResponse = await fetchText(url, fetcher, options.timeoutMs || 10000);
          if (feedResponse.ok && looksLikeFeed(feedResponse.text)) {
            return { source, status: 'active_feed', discoveredUrl: url, httpStatus: feedResponse.status };
          }
        } catch {
          // Keep discovery bounded and quiet.
        }
      }
      const sitemapLink = response.text.match(/href=["']([^"']*sitemap[^"']*\.xml[^"']*)["']/i)?.[1];
      if (sitemapLink) {
        try {
          const sitemapUrl = new URL(sitemapLink, homepageUrl).toString();
          const sitemapResponse = await fetchText(sitemapUrl, fetcher, options.timeoutMs || 10000);
          if (sitemapResponse.ok && looksLikeSitemap(sitemapResponse.text)) {
            return { source, status: 'active_sitemap', discoveredUrl: sitemapUrl, httpStatus: sitemapResponse.status };
          }
        } catch {
          // Homepage hinted at a sitemap, but the bounded fetch did not validate it.
        }
      }
      return { source, status: 'landing_page_only', discoveredUrl: homepageUrl, httpStatus: response.status };
    }
    return { source, status: response.status === 402 || response.status === 403 ? 'blocked' : 'extraction_failed', discoveredUrl: homepageUrl, httpStatus: response.status };
  } catch (error) {
    return { source, status: 'extraction_failed', reason: compact(error.message), discoveredUrl: '' };
  }
}

export async function discoverSourceFeeds(sources = [], options = {}) {
  const results = [];
  for (const source of sources) {
    results.push(await discoverSourceFeed(source, options));
  }
  return results;
}
