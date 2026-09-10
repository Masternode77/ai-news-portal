import { PIPELINE_OFFLINE } from './constants.mjs';
import { stripHtml, truncate } from './normalize.mjs';
import { analyzeExtractionQuality } from './quality-gate.mjs';
import { fetchAuthorizedSourceText } from './source-text-fetcher.mjs';

const GENERIC_ADAPTER = 'generic';

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
  {
    // Abstract pages only: arXiv metadata (title, abstract, authors) is CC0,
    // the e-print itself is not. The abstract sits in a blockquote without
    // paragraph tags, so the section falls through to plain text.
    domain: 'arxiv.org',
    id: 'arxiv',
    contentPatterns: [
      /<blockquote[^>]+class=["'][^"']*abstract[^"']*["'][^>]*>([\s\S]*?)<\/blockquote>/i,
    ],
    removePatterns: [
      /^\s*Abstract:\s*/i,
    ],
  },
  {
    domain: 'federalregister.gov',
    id: 'federalregister',
    contentPatterns: [
      /<div[^>]+id=["']fulltext_content_area["'][^>]*>([\s\S]{0,45000})<\/div>/i,
      /<main[\s\S]*?>([\s\S]{0,45000})<\/main>/i,
    ],
    removePatterns: [
      /\[FR Doc\.[\s\S]*$/i,
      /BILLING CODE [0-9A-Z-]+/gi,
      /Start Printed Page \d+/gi,
      // The page's explanatory note about document headings sits inside the
      // full-text area and otherwise opens every extracted document.
      /(?:Document Headings\s+)?Document headings vary by document type but may contain the following:?(?:[\s\S]{0,900}?Document Drafting Handbook[^.]*\.)?\s*/gi,
    ],
  },
  {
    domain: 'whitehouse.gov',
    id: 'whitehouse',
    contentPatterns: [
      /<div[^>]+class=["'][^"']*(?:entry-content|wp-block-post-content)[^"']*["'][^>]*>([\s\S]{0,45000})<\/div>/i,
      /<main[\s\S]*?>([\s\S]{0,45000})<\/main>/i,
    ],
    removePatterns: [],
  },
  {
    domain: 'nsf.gov',
    id: 'nsf',
    contentPatterns: [
      /<div[^>]+class=["'][^"']*node__content[^"']*["'][^>]*>([\s\S]{0,45000})<\/div>/i,
      /<article[\s\S]*?>([\s\S]{0,45000})<\/article>/i,
      /<main[\s\S]*?>([\s\S]{0,45000})<\/main>/i,
    ],
    removePatterns: [],
  },
  {
    domain: 'sec.gov',
    id: 'sec',
    contentPatterns: [
      /<div[^>]+class=["'][^"']*field--name-body[^"']*["'][^>]*>([\s\S]{0,45000})<\/div>/i,
      /<main[\s\S]*?>([\s\S]{0,45000})<\/main>/i,
    ],
    removePatterns: [
      /###\s*$/,
    ],
  },
  {
    domain: 'acer.europa.eu',
    id: 'acer',
    contentPatterns: [
      /<article[\s\S]*?>([\s\S]{0,45000})<\/article>/i,
      /<main[\s\S]*?>([\s\S]{0,45000})<\/main>/i,
    ],
    removePatterns: [],
  },
  {
    // Press-corner detail pages are an Angular shell; the text lives behind the
    // documents API on the same host, keyed by TYPE/YY/NNNN.
    domain: 'ec.europa.eu',
    id: 'ec-presscorner',
    apiTarget: ecPresscornerApiTarget,
    contentPatterns: [
      /<article[\s\S]*?>([\s\S]{0,45000})<\/article>/i,
    ],
    removePatterns: [],
  },
];

const EC_PRESSCORNER_DETAIL = /^https:\/\/ec\.europa\.eu\/commission\/presscorner\/detail\/([a-z]{2})\/([a-z]+)_(\d+)_(\d+)\/?(?:[?#].*)?$/i;

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function ecPresscornerApiTarget(url = '') {
  const match = String(url || '').match(EC_PRESSCORNER_DETAIL);
  if (!match) return null;
  const [, language, type, year, number] = match;
  const reference = `${type.toUpperCase()}/${year}/${number}`;
  return {
    url: `https://ec.europa.eu/commission/presscorner/api/documents?reference=${encodeURIComponent(reference)}&language=${language.toLowerCase()}`,
    contentTypes: ['application/json'],
    accept: 'application/json',
    toHtml(text = '') {
      let payload;
      try {
        payload = JSON.parse(text);
      } catch {
        return '';
      }
      const resource = payload?.docuLanguageResource || {};
      const body = String(resource.htmlContent || '').trim();
      if (!body) return '';
      const title = String(resource.title || '').trim();
      return `<article>${title ? `<h1>${escapeHtml(title)}</h1>` : ''}${body}</article>`;
    },
  };
}

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

export async function fetchArticleExtraction({
  url,
  title = '',
  fallbackSnippet = '',
  sourceRegistryId = '',
  sources,
  now,
  networkOptions = {},
  timeoutMs = 12000,
} = {}) {
  if (PIPELINE_OFFLINE) {
    return fallbackExtraction(url, fallbackSnippet, 'pipeline_offline');
  }

  const adapter = adapterForUrl(url);
  const apiTarget = typeof adapter.apiTarget === 'function' ? adapter.apiTarget(url) : null;

  try {
    const fetched = await fetchAuthorizedSourceText({ url: apiTarget?.url || url, sourceRegistryId }, {
      ...networkOptions,
      now,
      sources,
      timeoutMs,
      contentTypes: apiTarget?.contentTypes,
      accept: apiTarget?.accept,
    });
    const html = apiTarget ? apiTarget.toHtml(fetched.text) : fetched.text;
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
  } catch (error) {
    return fallbackExtraction(url, fallbackSnippet, error?.code || 'fetch_failed');
  }
}
