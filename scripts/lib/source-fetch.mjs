import { PIPELINE_OFFLINE } from './constants.mjs';
import { stripHtml, truncate } from './normalize.mjs';
import { analyzeExtractionQuality } from './quality-gate.mjs';
import { safeHttpFetch } from './safe-http-fetch.mjs';
import { SourceRequestCoordinator } from './source-request-coordinator.mjs';

const GENERIC_ADAPTER = 'generic';

export const sourceRequestCoordinator = new SourceRequestCoordinator({
  onEvent: (event) => console.warn(JSON.stringify({ component: 'source-fetch', ...event })),
});

const SOURCE_ADAPTERS = [
  {
    domain: 'datacenterknowledge.com',
    id: 'datacenterknowledge',
    contentPatterns: [
      /<article[\s\S]*?>([\s\S]{0,45000})<\/article>/i,
      /<div[^>]+class=["'][^"']*(?:article-body|article-content|body-content)[^"']*["'][^>]*>([\s\S]{0,45000})<\/div>/i,
      /<main[\s\S]*?>([\s\S]{0,45000})<\/main>/i,
    ],
    removePatterns: [
      /Want more Data Center Knowledge stories[\s\S]*$/i,
      /Copyright(?:\s+\u00a9|\s+20|\s*&copy;)?[\s\S]*$/i,
    ],
  },
  {
    domain: 'bloomberg.com',
    id: 'bloomberg',
    contentPatterns: [
      /<article[\s\S]*?>([\s\S]{0,45000})<\/article>/i,
      /<main[\s\S]*?>([\s\S]{0,45000})<\/main>/i,
    ],
    removePatterns: [
      /Send a tip to our reporters[\s\S]{0,600}?Bookmark Save/gi,
      /(?:Facebook|X|LinkedIn|Email|Link|Gift)(?:\s+Gift this article)?/gi,
    ],
  },
  {
    domain: 'storagereview.com',
    id: 'storagereview',
    contentPatterns: [
      /<article[\s\S]*?>([\s\S]{0,45000})<\/article>/i,
      /<div[^>]+class=["'][^"']*(?:entry-content|post-content|article-content)[^"']*["'][^>]*>([\s\S]{0,45000})<\/div>/i,
    ],
    removePatterns: [
      /Subscribe to StorageReview[\s\S]*$/i,
      /Join our newsletter[\s\S]*$/i,
    ],
  },
  {
    domain: 'datacenterfrontier.com',
    id: 'datacenterfrontier',
    contentPatterns: [
      /<article[\s\S]*?>([\s\S]{0,45000})<\/article>/i,
      /<div[^>]+class=["'][^"']*(?:article-content|body-content|post-body)[^"']*["'][^>]*>([\s\S]{0,45000})<\/div>/i,
      /<main[\s\S]*?>([\s\S]{0,45000})<\/main>/i,
    ],
    removePatterns: [
      /Related:\s*[\s\S]*$/i,
      /Sign up for Data Center Frontier[\s\S]*$/i,
    ],
  },
  {
    domain: 'semiengineering.com',
    id: 'semiengineering',
    contentPatterns: [
      /<article[\s\S]*?>([\s\S]{0,45000})<\/article>/i,
      /<div[^>]+class=["'][^"']*(?:entry-content|post-content)[^"']*["'][^>]*>([\s\S]{0,45000})<\/div>/i,
    ],
    removePatterns: [
      /Find more chip industry research news[\s\S]*$/i,
      /Events and Webinars[\s\S]*$/i,
    ],
  },
  {
    domain: 'cloud.google.com',
    id: 'googlecloud',
    contentPatterns: [
      /<article[\s\S]*?>([\s\S]{0,45000})<\/article>/i,
      /<main[\s\S]*?>([\s\S]{0,45000})<\/main>/i,
      /<div[^>]+class=["'][^"']*(?:devsite-article-body|article-body)[^"']*["'][^>]*>([\s\S]{0,45000})<\/div>/i,
    ],
    removePatterns: [
      /Related products and resources[\s\S]*$/i,
      /Posted in[\s\S]*$/i,
    ],
  },
  {
    domain: 'techcrunch.com',
    id: 'techcrunch',
    contentPatterns: [
      /<article[\s\S]*?>([\s\S]{0,45000})<\/article>/i,
      /<div[^>]+class=["'][^"']*(?:article-content|entry-content|post-content)[^"']*["'][^>]*>([\s\S]{0,45000})<\/div>/i,
    ],
    removePatterns: [
      /Most Popular[\s\S]*$/i,
      /Tickets are limited[\s\S]*$/i,
      /StrictlyVC[\s\S]*$/i,
    ],
  },
  {
    domain: 'servethehome.com',
    id: 'servethehome',
    contentPatterns: [
      /<article[\s\S]*?>([\s\S]{0,45000})<\/article>/i,
      /<div[^>]+class=["'][^"']*(?:entry-content|td-post-content|post-content)[^"']*["'][^>]*>([\s\S]{0,45000})<\/div>/i,
    ],
    removePatterns: [
      /Join the STH forums[\s\S]*$/i,
      /Subscribe to the STH newsletter[\s\S]*$/i,
    ],
  },
  {
    domain: 'datacenterpost.com',
    id: 'datacenterpost',
    contentPatterns: [
      /<article[\s\S]*?>([\s\S]{0,45000})<\/article>/i,
      /<div[^>]+class=["'][^"']*(?:entry-content|post-content|article-content)[^"']*["'][^>]*>([\s\S]{0,45000})<\/div>/i,
    ],
    removePatterns: [
      /About Data Center POST[\s\S]*$/i,
      /Subscribe[\s\S]*$/i,
    ],
  },
];

function sourceDomain(url = '') {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

function adapterForUrl(url = '') {
  const hostname = sourceDomain(url);
  return SOURCE_ADAPTERS.find((adapter) => (
    hostname === adapter.domain || hostname.endsWith(`.${adapter.domain}`)
  )) || {
    domain: hostname,
    id: GENERIC_ADAPTER,
    contentPatterns: [
      /<article[\s\S]*?>([\s\S]{0,45000})<\/article>/i,
      /<main[\s\S]*?>([\s\S]{0,45000})<\/main>/i,
    ],
    removePatterns: [],
  };
}

function removeNonContentBlocks(html = '') {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<aside[\s\S]*?<\/aside>/gi, ' ')
    .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
    .replace(/<form[\s\S]*?<\/form>/gi, ' ');
}

function applyAdapterRemovals(text = '', adapter) {
  return (adapter.removePatterns || []).reduce(
    (cleaned, pattern) => cleaned.replace(pattern, ' '),
    text
  );
}

function extractSection(html = '', adapter) {
  const cleanedHtml = removeNonContentBlocks(html);
  for (const pattern of adapter.contentPatterns || []) {
    const match = cleanedHtml.match(pattern);
    if (match?.[1]) return match[1];
  }
  return cleanedHtml;
}

function paragraphTextFromSection(section = '', adapter) {
  const paragraphs = [...section.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((match) => stripHtml(match[1]))
    .map((text) => text.replace(/\s+/g, ' ').trim())
    .filter((text) => text.length > 60 && !/cookie|subscribe|advertisement/i.test(text))
    .slice(0, 14);

  const rawText = (paragraphs.join(' ') || stripHtml(section)).replace(/\s+/g, ' ').trim();
  const cleanedText = applyAdapterRemovals(rawText, adapter).replace(/\s+/g, ' ').trim();
  return { rawText, cleanedText };
}

function truncateAtSentence(text = '', maxLen = 1800) {
  const cleaned = String(text || '').trim();
  if (cleaned.length <= maxLen) return cleaned;
  const clipped = cleaned.slice(0, maxLen);
  const sentenceEnd = Math.max(
    clipped.lastIndexOf('. '),
    clipped.lastIndexOf('! '),
    clipped.lastIndexOf('? ')
  );
  if (sentenceEnd >= 500) {
    return clipped.slice(0, sentenceEnd + 1).trim();
  }
  return truncate(cleaned, maxLen);
}

function fallbackExtraction(url, fallbackSnippet, reason) {
  const adapter = adapterForUrl(url);
  const articleText = truncate(fallbackSnippet, 500);
  const extractionQa = analyzeExtractionQuality({
    title: '',
    articleText,
    fallbackSnippet,
    sourceUrl: url,
    sourceDomainAdapter: adapter.id,
    rawText: articleText,
    extractionFailureReason: reason,
  });
  return { articleText, extractionQa };
}

export async function fetchArticleExcerpt(url, fallbackSnippet = '', timeoutMs = 12000) {
  const { articleText } = await fetchArticleExtraction({ url, fallbackSnippet, timeoutMs });
  return articleText;
}

export function extractArticleHtml({
  html = '',
  url = '',
  title = '',
  fallbackSnippet = '',
} = {}) {
  const adapter = adapterForUrl(url);
  const articleSection = extractSection(html, adapter);
  const { rawText, cleanedText } = paragraphTextFromSection(articleSection, adapter);
  const articleText = truncateAtSentence(cleanedText || fallbackSnippet, 1800);
  const extractionQa = analyzeExtractionQuality({
    title,
    articleText,
    fallbackSnippet,
    sourceUrl: url,
    sourceDomainAdapter: adapter.id,
    rawText,
  });
  return { articleText, extractionQa };
}

export async function fetchArticleExtraction({
  url,
  title = '',
  fallbackSnippet = '',
  timeoutMs = 12000,
  coordinator = sourceRequestCoordinator,
  allowedDomains,
} = {}) {
  if (PIPELINE_OFFLINE) {
    return fallbackExtraction(url, fallbackSnippet, 'pipeline_offline');
  }

  try {
    const response = await coordinator.execute(url, async () => {
      try {
        const result = await safeHttpFetch(url, {
          timeoutMs,
          headers: {
            'user-agent': 'Mozilla/5.0 (compatible; AINewsPortalBot/1.0)',
            accept: 'text/html,application/xhtml+xml',
          },
          allowedMimeTypes: ['text/html', 'application/xhtml+xml'],
          maxRedirects: 4,
          allowedDomains,
          maxCompressedBytes: 2 * 1024 * 1024,
          maxDecompressedBytes: 4 * 1024 * 1024,
        });
        if (result.status === 408 || result.status === 429 || result.status >= 500) {
          throw Object.assign(new Error(`source returned HTTP ${result.status}`), {
            code: 'source_http_status',
            status: result.status,
            retryable: true,
          });
        }
        return result;
      } catch (error) {
        if (error?.retryable === true) throw error;
        const message = error?.message || '';
        const retryable = /timed out|aborted|fetch failed|socket|network|ECONN|EAI_AGAIN/i.test(message);
        if (!retryable) throw error;
        throw Object.assign(new Error(message, { cause: error }), {
          code: error?.code || 'source_network_failure',
          retryable: true,
        });
      }
    });

    if (!response.ok) {
      return fallbackExtraction(url, fallbackSnippet, `http_${response.status}`);
    }

    return extractArticleHtml({
      html: await response.text(),
      url,
      title,
      fallbackSnippet,
    });
  } catch (error) {
    const reason = error?.code === 'source_http_status'
      ? `http_${error.status}`
      : error?.code === 'source_circuit_open'
        ? 'source_circuit_open'
        : /timed out|aborted/i.test(error?.message || '')
      ? 'timeout'
      : /non-public|HTTP\(S\)|credentials|downgrade|redirect/i.test(error?.message || '')
        ? 'unsafe_source_url'
        : /MIME|encoding|response exceeds/i.test(error?.message || '')
          ? 'unsupported_source_response'
          : 'fetch_failed';
    return fallbackExtraction(url, fallbackSnippet, reason);
  }
}
