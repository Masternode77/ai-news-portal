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
  const featuredId = feed.featured?.id || '';
  const candidates = items.filter((item) => !featuredId || item.id !== featuredId);
  const generatedLead = candidates.find((item) => hasGeneratedRasterImage(item.publicSignal));
  return generatedLead?.publicSignal || feed.featured?.publicSignal || items[0]?.publicSignal || null;
}
