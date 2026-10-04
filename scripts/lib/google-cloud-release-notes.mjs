const PRODUCTS = {
  '/compute/docs/release-notes': 'Google Cloud Compute Engine',
  '/gemini-enterprise-agent-platform/release-notes': 'Google Cloud AI',
  '/tpu/docs/release-notes': 'Google Cloud TPU',
};

// Registry rows whose items are dated Google Cloud release-note sections.
export const GOOGLE_RELEASE_SOURCE_PATTERN = /^google-cloud-(?:compute|ai|tpu)-releases$/;

export function scopeGoogleAiReleaseItem(item = {}) {
  const content = String(item.content || '');
  const marker = /<h2\b[^>]*>Gemini Enterprise Agent Platform<\/h2>/i.exec(content);
  if (!marker) return null;
  let url;
  try {
    url = new URL(item.link);
    if (url.origin !== 'https://docs.cloud.google.com' || url.pathname !== '/release-notes') return null;
    url.pathname = '/gemini-enterprise-agent-platform/release-notes';
    if (!googleReleaseNoteTarget(url.href)) return null;
  } catch {
    return null;
  }
  const rest = content.slice(marker.index + marker[0].length);
  const end = rest.search(/<h2\b/i);
  return { ...item, link: url.href, content: end < 0 ? rest : rest.slice(0, end), contentEncoded: undefined, contentSnippet: undefined, summary: undefined };
}

export function googleReleaseNoteTarget(value = '') {
  try {
    const url = new URL(value);
    const product = PRODUCTS[url.pathname];
    if (url.protocol !== 'https:' || url.hostname !== 'docs.cloud.google.com' || url.port || url.username || url.password || !product
      || !/^#(?:January|February|March|April|May|June|July|August|September|October|November|December)_\d{2}_\d{4}$/.test(url.hash)) return null;
    return { product, anchor: url.hash.slice(1) };
  } catch {
    return null;
  }
}

// A release-notes URL is a dated source, not the entire continuously updated
// archive. Missing anchors or licence markers must never fall back to the page.
export function googleReleaseNoteSection(html = '', url = '') {
  const target = googleReleaseNoteTarget(url);
  if (!target || !/href=["']https:\/\/creativecommons\.org\/licenses\/by\/4\.0\/["']/i.test(html)) return '';
  const start = new RegExp(`<h2\\b[^>]*\\bid=["']${target.anchor}["'][^>]*>[\\s\\S]*?<\\/h2>`, 'i').exec(html);
  if (!start) return '';
  const rest = html.slice(start.index + start[0].length);
  const end = rest.search(/<h2\b|<footer\b|<\/article>/i);
  return end >= 0 ? rest.slice(0, end) : '';
}
