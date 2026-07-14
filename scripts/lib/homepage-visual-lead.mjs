function imagePath(signal = {}) {
  return String(signal.image || '').trim();
}

export function hasGeneratedRasterImage(signal = {}) {
  const image = imagePath(signal);
  return /^\/generated\/articles\/.+\.(?:avif|webp|png|jpe?g)(?:[?#].*)?$/i.test(image)
    && signal.image_status !== 'placeholder'
    && signal.image_status !== 'fallback';
}

export function hasImage2RasterImage(signal = {}) {
  return hasGeneratedRasterImage(signal)
    && signal.image_provider === 'image2';
}

function dateMs(signal = {}) {
  const value = new Date(signal.date || signal.analysisPublishedAt || signal.publishedAt || 0).getTime();
  return Number.isFinite(value) ? value : 0;
}

export function selectHomepageVisualLead(feed = {}, options = {}) {
  const items = Array.isArray(feed.items) ? feed.items : [];
  const featured = feed.featured?.publicSignal;
  const candidates = [featured, ...items.map((item) => item.publicSignal)].filter(Boolean);
  const newest = Math.max(...candidates.map(dateMs), 0);
  const maximumAgeMs = (options.image2MaxAgeDays ?? 45) * 24 * 60 * 60 * 1000;
  const image2Lead = candidates
    .slice(0, options.image2CandidateLimit ?? 12)
    .find((candidate) => (
      hasImage2RasterImage(candidate)
      && (!newest || (dateMs(candidate) > 0 && newest - dateMs(candidate) <= maximumAgeMs))
    ));
  if (image2Lead) return image2Lead;
  if (hasGeneratedRasterImage(featured)) return featured;

  const generatedLead = items.find((item) => hasGeneratedRasterImage(item.publicSignal));
  return generatedLead?.publicSignal || featured || items[0]?.publicSignal || null;
}
