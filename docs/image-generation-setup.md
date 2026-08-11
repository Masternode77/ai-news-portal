# Image Generation Setup

The preferred provider is `IMAGE_PROVIDER=image2`. It uses the OpenAI image API path through `scripts/lib/image2-provider.mjs` and stores generated article assets under `public/generated/articles/{slug}/`.

## Provider Selection

- `IMAGE_PROVIDER=image2`: canonical provider for article hero, thumbnail, and OpenGraph variants.
- `IMAGE_PROVIDER=openai-api`: direct OpenAI API fallback.
- `IMAGE_PROVIDER=chatgpt`: legacy OAuth runtime adapter.
- `IMAGE_PROVIDER=local`: no remote generation; local/category fallback only.
- `IMAGE_PROVIDER=legacy-gemini`: deprecated Gemini path.

`OPENAI_API_KEY` is required for remote image generation. Without it, when `PIPELINE_OFFLINE=1`, or after an image-request failure, image2 writes its deterministic local WebP fallback variant set (hero, thumbnail, OpenGraph, and legacy paths) instead of publishing broken images. This is not category-fallback metadata.

## Cost Controls

Set these before running bulk regeneration:

- `OPENAI_IMAGE_MODEL`
- `OPENAI_IMAGE_SIZE`
- `OPENAI_IMAGE_QUALITY`
- `IMAGE2_HERO_SIZE`
- `IMAGE2_OUTPUT_FORMAT`

Use `PIPELINE_OFFLINE=1` or `IMAGE_PROVIDER=local` for dry runs. Run a single-article test before a batch:

```bash
IMAGE_PROVIDER=image2 PIPELINE_OFFLINE=1 node scripts/generate-article-image.mjs --id <article-id> --dry-run
```

## Fallback Behavior

Image2 fallback variants are article-local WebP files under `public/generated/articles/`. Reader-side category fallback SVGs live under `public/generated/fallbacks/` and are selected only when the article image surface has no trusted variant. The `local`/no-provider path may attempt a source-authorized poster only while online; failed or unauthorized poster attempts fall back to the deterministic local variant set.

The generic editor does not expose article, brief, or image-regeneration controls. It can save existing article metadata and use an operator-supplied replacement image path; generation or reprocessing remains outside that editor and must pass the normal rights and publication gates. Image metadata written by the image pipeline includes provider, model, prompt, alt text, status, error, `heroImage`, `thumbnailImage`, and `ogImage`.

## Verification

Run:

```bash
npm run audit:images
npm run content:gate
```

The image audit fails on missing local assets, blank public cards, broken generated paths, and stock-derived images.
