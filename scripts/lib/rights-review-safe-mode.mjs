import fs from 'node:fs';
import path from 'node:path';
import { activeRegistryFeeds, loadSourceRegistrySync } from './source-registry.mjs';

export const RIGHTS_REVIEW_SAFE_MODE = 'rights_review_safe_mode';
export const RIGHTS_REVIEW_PAUSE_STATE = 'zero-authorized-sources';

const COUNT_FIELDS = [
  ['publicCardCount', 'public_card_count'],
  ['publicDetailCount', 'public_detail_count'],
  ['rssItemCount', 'rss_item_count'],
  ['localNewsLinkCount', 'local_news_link_count'],
];

function nonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0;
}

export function rightsReviewSafeModeResult(evidence = {}) {
  const reasons = [];
  if (!nonNegativeInteger(evidence.authorizedSourceCount)) {
    reasons.push('rights_review_safe_mode_authorized_source_count_invalid');
  } else if (evidence.authorizedSourceCount !== 0) {
    reasons.push('rights_review_safe_mode_authorized_sources_present');
  }

  for (const [field, reasonField] of COUNT_FIELDS) {
    if (!nonNegativeInteger(evidence[field])) {
      reasons.push(`rights_review_safe_mode_${reasonField}_invalid`);
    } else if (evidence[field] !== 0) {
      reasons.push(`rights_review_safe_mode_${reasonField.replace('_count', 's')}_present`);
    }
  }

  if (evidence.paidAdsEnabled !== false) {
    reasons.push(evidence.paidAdsEnabled === true
      ? 'rights_review_safe_mode_paid_ads_enabled'
      : 'rights_review_safe_mode_paid_ads_state_invalid');
  }
  if (evidence.pauseStateVisible !== true) {
    reasons.push('rights_review_safe_mode_pause_state_not_visible');
  }

  return {
    ok: reasons.length === 0,
    mode: reasons.length === 0 ? RIGHTS_REVIEW_SAFE_MODE : 'normal',
    reasons,
    evidence: { ...evidence },
  };
}

function renderedFiles(distDir) {
  if (!fs.existsSync(distDir)) return [];
  const files = [];
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(absolutePath);
      else if (/\.(?:html|xml)$/i.test(entry.name)) files.push(absolutePath);
    }
  };
  visit(distDir);
  return files;
}

function occurrenceCount(source, pattern) {
  return [...String(source || '').matchAll(pattern)].length;
}

export function collectRightsReviewSafeModeEvidence({
  distDir = 'dist',
  sourceRegistry = loadSourceRegistrySync(),
  now = new Date(),
} = {}) {
  const absoluteDistDir = path.resolve(distDir);
  const files = renderedFiles(absoluteDistDir);
  const rendered = files.map((filePath) => ({
    filePath,
    source: fs.readFileSync(filePath, 'utf8'),
  }));
  const publicRendered = rendered.filter(({ filePath }) => {
    const relativePath = path.relative(absoluteDistDir, filePath);
    return !relativePath.startsWith(`admin${path.sep}`)
      && !relativePath.startsWith(`admin.html${path.sep}`);
  });
  const homepage = rendered.find(({ filePath }) => filePath === path.join(absoluteDistDir, 'index.html'))?.source || '';
  const rss = rendered.find(({ filePath }) => filePath === path.join(absoluteDistDir, 'rss.xml'))?.source || '';
  const combined = publicRendered.map(({ source }) => source).join('\n');
  const allRendered = rendered.map(({ source }) => source).join('\n');
  const newsRoot = path.join(absoluteDistDir, 'news');
  const publicDetailCount = rendered.filter(({ filePath }) => (
    filePath.startsWith(`${newsRoot}${path.sep}`) && path.basename(filePath) === 'index.html'
  )).length;
  const hasPauseMarker = homepage.includes(`data-rights-review-state="${RIGHTS_REVIEW_PAUSE_STATE}"`);
  const hasVisiblePauseCopy = /Source-linked and long-form publication paused[^<]*0 authorized sources/i.test(homepage);

  return {
    authorizedSourceCount: activeRegistryFeeds(sourceRegistry, now).length,
    publicCardCount: occurrenceCount(combined, /<article\b[^>]*\bdata-public-card\b/gi),
    publicDetailCount,
    rssItemCount: occurrenceCount(rss, /<item\b/gi),
    localNewsLinkCount: occurrenceCount(combined, /href=["'](?:https:\/\/(?:www\.)?computecurrent\.com)?\/news\//gi),
    paidAdsEnabled: /pagead2\.googlesyndication\.com|class=["'][^"']*\badsbygoogle\b|\bdata-ad-client=/i.test(allRendered),
    pauseStateVisible: hasPauseMarker && hasVisiblePauseCopy,
  };
}
