function imagePath(signal = {}) {
  return String(signal.image || '').trim();
}

export function hasGeneratedRasterImage(signal = {}) {
  const image = imagePath(signal);
  return /^\/generated\/articles\/.+\.(?:avif|webp|png|jpe?g)(?:[?#].*)?$/i.test(image)
    && signal.image_status !== 'placeholder'
    && signal.image_status !== 'fallback';
}

export function selectHomepageVisualLead(feed = {}) {
  const items = Array.isArray(feed.items) ? feed.items : [];
  const featured = feed.featured?.publicSignal;
  if (hasGeneratedRasterImage(featured)) return featured;

  const generatedLead = items.find((item) => hasGeneratedRasterImage(item.publicSignal));
  return generatedLead?.publicSignal || featured || items[0]?.publicSignal || null;
}
