import { stripHtml } from './normalize.mjs';

function decodeEntities(value = '') {
  return String(value)
    .replace(/&(?:ndash|mdash);|&#(?:8211|8212);/gi, '-')
    .replace(/&(?:lsquo|rsquo);|&#(?:8216|8217);/gi, "'")
    .replace(/&(?:ldquo|rdquo);|&#(?:8220|8221);/gi, '"')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/\s+/g, ' ')
    .trim();
}

function articleSection(html = '') {
  const starts = [
    /<div[^>]+class=["']tie-article["'][^>]*>/i,
    /<div[^>]+class=["'][^"']*pagecontent\s+mr_temp4[^"']*["'][^>]*>/i,
  ];
  for (const pattern of starts) {
    const index = html.search(pattern);
    if (index >= 0) return html.slice(index);
  }
  return html;
}

function contentStopIndex(section = '') {
  const stops = [
    /<(?:p|div)[^>]*>\s*<(?:strong|b)[^>]*>\s*(?:Principal contributors?|Tags:|Press Contact:|EIA Program Contact:)/i,
    /<p[^>]*>\s*(?:EIA Program Contact:|EIA Press Contact:)/i,
    /<div[^>]+class=["']feature["'][^>]*>/i,
  ].map((pattern) => section.search(pattern)).filter((index) => index >= 0);
  return stops.length ? Math.min(...stops) : section.length;
}

export function extractEiaSourceText(html = '') {
  const section = articleSection(String(html));
  const content = section.slice(0, contentStopIndex(section));
  const title = stripHtml(String(html).match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '');
  const heading = stripHtml(content.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || '');
  const paragraphs = [...content.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((match) => stripHtml(match[1]))
    .filter((paragraph) => paragraph.length > 60)
    .filter((paragraph) => !/^(?:Data source|Note:|Image:|U\.S\. ENERGY INFORMATION ADMINISTRATION)/i.test(paragraph));
  const text = decodeEntities([title, heading, ...paragraphs].filter(Boolean).join(' '));
  const sentenceEnd = Math.max(text.lastIndexOf('.'), text.lastIndexOf('!'), text.lastIndexOf('?'));
  return sentenceEnd >= 500 ? text.slice(0, sentenceEnd + 1).trim() : text;
}
