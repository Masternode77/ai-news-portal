export function stripHtml(value = '') {
  return String(value || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

export function visibleBodyText(body = '') {
  return stripHtml(body);
}

export function visibleBodyLength(body = '') {
  return visibleBodyText(body).length;
}

export function wordCount(body = '') {
  return visibleBodyText(body).split(/\s+/).filter(Boolean).length;
}

export function bodyParagraphs(body = '') {
  return String(body || '')
    .split(/\n{2,}/)
    .map((paragraph) => stripHtml(paragraph))
    .filter((paragraph) => paragraph && !isHeading(paragraph));
}

export function paragraphCount(body = '') {
  return bodyParagraphs(body).length;
}

export function isHeading(line = '') {
  const text = stripHtml(line);
  return text.length > 0
    && text.length <= 86
    && !/[.!?]$/.test(text)
    && /^[A-Z0-9][A-Za-z0-9 &:/+-]+$/.test(text);
}

export function headingSequence(body = '') {
  return String(body || '')
    .split(/\n{2,}/)
    .map((block) => stripHtml(block))
    .filter(isHeading);
}

export function sectionCount(body = '') {
  return headingSequence(body).length;
}
