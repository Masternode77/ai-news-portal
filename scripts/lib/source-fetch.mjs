import { stripHtml, truncate } from './normalize.mjs';

export async function fetchArticleExcerpt(url, fallbackSnippet = '', timeoutMs = 12000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; AINewsPortalBot/1.0)',
        accept: 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
    });

    if (!response.ok) {
      return truncate(fallbackSnippet, 500);
    }

    const html = await response.text();
    const articleSection =
      html.match(/<article[\s\S]*?>([\s\S]{0,30000})<\/article>/i)?.[1] ||
      html.match(/<main[\s\S]*?>([\s\S]{0,30000})<\/main>/i)?.[1] ||
      html;

    const paragraphs = [...articleSection.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
      .map((match) => stripHtml(match[1]))
      .filter((text) => text.length > 60 && !/cookie|subscribe|advertisement/i.test(text))
      .slice(0, 8);

    const text = paragraphs.join(' ');
    return truncate(text || fallbackSnippet, 1400);
  } catch {
    return truncate(fallbackSnippet, 500);
  } finally {
    clearTimeout(timeout);
  }
}
