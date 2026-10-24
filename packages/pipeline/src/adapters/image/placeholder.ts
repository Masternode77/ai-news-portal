/**
 * Brand placeholder (Phase 3f): a deterministic editorial SVG per publication
 * (palette from the slug, motif from the topic vocabulary in `image.placeholder`),
 * written through the image store. It never costs anything and only falls back
 * to the static `/images/placeholder-brief.svg` when the store itself fails, so
 * the chain always ends with an image (P5, ADR-004 IMAGE_MISSING is soft).
 */
import { createHash } from "node:crypto";
import type { ImageAdapter, ImageRequest, ImageResult, StageContext } from "@cc/shared";

export const PLACEHOLDER_IMAGE_PATH = "/images/placeholder-brief.svg";
export const PLACEHOLDER_MODEL = "svg-editorial/2026-10-24.1";

export interface PlaceholderOptions {
  topics?: Record<string, readonly string[]>;
  defaultTopic?: string;
}

/** First topic whose vocabulary appears in the text (case-insensitive), else the default. */
export function placeholderTopic(text: string, topics: Record<string, readonly string[]>, fallback: string): string {
  const haystack = text.toLowerCase();
  for (const [topic, terms] of Object.entries(topics)) {
    if (terms.some((term) => haystack.includes(term.toLowerCase()))) return topic;
  }
  return fallback;
}

function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function titleLines(title: string, maxChars = 26, maxLines = 2): string[] {
  const words = title.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > maxChars && line) {
      lines.push(line);
      line = word;
      if (lines.length === maxLines) break;
    } else {
      line = next;
    }
  }
  if (line && lines.length < maxLines) lines.push(line);
  if (lines.length === maxLines && words.join(" ").length > lines.join(" ").length) lines[maxLines - 1] = `${lines[maxLines - 1]!.slice(0, maxChars - 1)}…`;
  return lines;
}

function motif(topic: string, w: number, h: number): string {
  const stroke = 'fill="none" stroke="rgba(233,246,255,0.72)" stroke-width="3" stroke-linecap="round"';
  switch (topic) {
    case "power-grid":
      return `<g ${stroke}><path d="M${w * 0.2} ${h * 0.78}L${w * 0.32} ${h * 0.3}L${w * 0.44} ${h * 0.78}M${w * 0.56} ${h * 0.78}L${w * 0.68} ${h * 0.24}L${w * 0.8} ${h * 0.78}"/><path d="M${w * 0.15} ${h * 0.46}H${w * 0.85}M${w * 0.23} ${h * 0.58}H${w * 0.77}"/></g>`;
    case "cooling":
      return `<g ${stroke}><path d="M${w * 0.16} ${h * 0.36}C${w * 0.3} ${h * 0.18},${w * 0.42} ${h * 0.54},${w * 0.56} ${h * 0.36}S${w * 0.78} ${h * 0.18},${w * 0.88} ${h * 0.4}"/><path d="M${w * 0.12} ${h * 0.64}C${w * 0.28} ${h * 0.46},${w * 0.46} ${h * 0.82},${w * 0.6} ${h * 0.62}S${w * 0.78} ${h * 0.44},${w * 0.9} ${h * 0.64}"/></g>`;
    case "semiconductors":
      return `<g ${stroke}><rect x="${w * 0.4}" y="${h * 0.3}" width="${w * 0.2}" height="${w * 0.2}" rx="12"/><path d="M${w * 0.4} ${h * 0.38}H${w * 0.33}M${w * 0.4} ${h * 0.5}H${w * 0.33}M${w * 0.6} ${h * 0.38}H${w * 0.67}M${w * 0.6} ${h * 0.5}H${w * 0.67}"/></g>`;
    case "capital-markets":
      return `<g ${stroke}><path d="M${w * 0.14} ${h * 0.72}L${w * 0.32} ${h * 0.56}L${w * 0.48} ${h * 0.64}L${w * 0.66} ${h * 0.38}L${w * 0.86} ${h * 0.3}"/><circle cx="${w * 0.66}" cy="${h * 0.38}" r="7"/></g>`;
    case "regulation":
      return `<g ${stroke}><rect x="${w * 0.36}" y="${h * 0.28}" width="${w * 0.28}" height="${h * 0.44}" rx="8"/><path d="M${w * 0.42} ${h * 0.4}H${w * 0.58}M${w * 0.42} ${h * 0.5}H${w * 0.58}M${w * 0.42} ${h * 0.6}H${w * 0.52}"/></g>`;
    case "supply-chain":
      return `<g ${stroke}><path d="M${w * 0.1} ${h * 0.62}H${w * 0.3}L${w * 0.42} ${h * 0.42}H${w * 0.66}L${w * 0.9} ${h * 0.24}"/><circle cx="${w * 0.3}" cy="${h * 0.62}" r="7"/><circle cx="${w * 0.66}" cy="${h * 0.42}" r="7"/></g>`;
    case "cloud-capacity":
      return `<g ${stroke}><path d="M${w * 0.3} ${h * 0.62}a${w * 0.08} ${w * 0.08} 0 0 1 ${w * 0.1} ${-h * 0.2}a${w * 0.1} ${w * 0.1} 0 0 1 ${w * 0.2} ${-h * 0.04}a${w * 0.08} ${w * 0.08} 0 0 1 ${w * 0.1} ${h * 0.24}Z"/></g>`;
    case "data-centers":
      return `<g ${stroke}><rect x="${w * 0.3}" y="${h * 0.3}" width="${w * 0.12}" height="${h * 0.42}" rx="6"/><rect x="${w * 0.44}" y="${h * 0.3}" width="${w * 0.12}" height="${h * 0.42}" rx="6"/><rect x="${w * 0.58}" y="${h * 0.3}" width="${w * 0.12}" height="${h * 0.42}" rx="6"/></g>`;
    default:
      return `<g ${stroke}><path d="M${w * 0.1} ${h * 0.7}C${w * 0.3} ${h * 0.35},${w * 0.5} ${h * 0.78},${w * 0.9} ${h * 0.3}"/><circle cx="${w * 0.32}" cy="${h * 0.43}" r="9"/><circle cx="${w * 0.68}" cy="${h * 0.54}" r="9"/></g>`;
  }
}

/** 1200×630 (OpenGraph-safe) editorial SVG. Same inputs → same bytes. */
export function placeholderSvg(input: { title: string; topic: string; seed: string }): string {
  const digest = createHash("sha256").update(input.seed).digest();
  const rgb = (i: number, base: number, span: number) => `rgb(${base + (digest[i]! % span)} ${base + 20 + (digest[i + 1]! % span)} ${base + 50 + (digest[i + 2]! % span)})`;
  const one = rgb(0, 15, 40);
  const two = rgb(3, 60, 70);
  const three = rgb(6, 150, 60);
  const w = 1200;
  const h = 630;
  const pad = 84;
  const lines = titleLines(input.title);
  const title = lines.map((line, index) => `<tspan x="${pad}" dy="${index ? 48 : 0}">${escapeXml(line)}</tspan>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${escapeXml(input.title)}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${one}"/><stop offset="0.5" stop-color="#101820"/><stop offset="1" stop-color="#070a0f"/></linearGradient>
    <filter id="soft"><feGaussianBlur stdDeviation="22"/></filter>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#bg)"/>
  <circle cx="${Math.round(w * 0.2)}" cy="${Math.round(h * 0.18)}" r="${Math.round(w * 0.15)}" fill="${two}" opacity="0.3" filter="url(#soft)"/>
  <circle cx="${Math.round(w * 0.82)}" cy="${Math.round(h * 0.2)}" r="${Math.round(w * 0.12)}" fill="${three}" opacity="0.26" filter="url(#soft)"/>
  <g stroke="rgba(255,255,255,0.08)" stroke-width="1"><path d="M${pad} ${Math.round(h * 0.76)}H${w - pad}"/><path d="M${pad} ${Math.round(h * 0.64)}H${w - pad}"/><path d="M${Math.round(w * 0.5)} ${pad}V${h - pad}"/></g>
  ${motif(input.topic, w, h)}
  <text x="${pad}" y="${Math.round(h * 0.15)}" fill="rgba(234,244,255,0.74)" font-family="Arial, sans-serif" font-size="14" font-weight="700" letter-spacing="2">COMPUTE CURRENT / ${escapeXml(input.topic.toUpperCase())}</text>
  <text x="${pad}" y="${Math.round(h * 0.82)}" fill="#ffffff" font-family="Arial, sans-serif" font-size="40" font-weight="700">${title}</text>
  <rect x="${pad / 2}" y="${pad / 2}" width="${w - pad}" height="${h - pad}" rx="24" fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.14)"/>
</svg>
`;
}

/** The static brand file, used only when the store cannot take the generated SVG. */
export function staticPlaceholder(request: ImageRequest, ctx: StageContext): ImageResult {
  return {
    path: PLACEHOLDER_IMAGE_PATH,
    alt: request.alt || "Compute Current placeholder artwork",
    provenance: { provider: "placeholder", model: "static", prompt: request.prompt, generatedAt: ctx.now.toISOString() },
    placeholder: true,
    costUsd: 0,
  };
}

export function createPlaceholderImageAdapter(options: PlaceholderOptions = {}): ImageAdapter {
  return {
    provider: "placeholder",
    async generate(request: ImageRequest, ctx: StageContext): Promise<ImageResult> {
      const topic = placeholderTopic(`${request.title ?? ""} ${(request.tags ?? []).join(" ")} ${request.prompt}`, options.topics ?? {}, options.defaultTopic ?? "ai-infrastructure");
      const svg = placeholderSvg({ title: request.title ?? request.alt, topic, seed: request.slug });
      const provenance = { provider: "placeholder", model: PLACEHOLDER_MODEL, prompt: request.prompt, generatedAt: ctx.now.toISOString() };
      try {
        const stored = await ctx.adapters.imageStore.put({ bytes: new TextEncoder().encode(svg), mime: "image/svg+xml", slug: request.slug, variant: "hero" }, ctx);
        return { path: stored.path, alt: request.alt || `${request.title ?? "Compute Current"} — editorial placeholder`, provenance, placeholder: true, costUsd: 0 };
      } catch (error) {
        ctx.logger.warn("image: placeholder store failed; using the static brand placeholder", { slug: request.slug, error: error instanceof Error ? error.message : String(error) });
        return staticPlaceholder(request, ctx);
      }
    },
  };
}
