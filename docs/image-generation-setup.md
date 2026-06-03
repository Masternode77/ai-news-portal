# Image Generation Setup

The preferred provider is `IMAGE_PROVIDER=image2`. It uses the OpenAI image API path through `scripts/lib/image2-provider.mjs` and stores generated article assets under `public/generated/articles/{slug}/`.

## Provider Selection

- `IMAGE_PROVIDER=image2`: canonical provider for article hero, thumbnail, and OpenGraph variants.
- `IMAGE_PROVIDER=openai-api`: direct OpenAI API fallback.
- `IMAGE_PROVIDER=chatgpt`: legacy OAuth runtime adapter.
- `IMAGE_PROVIDER=local`: no remote generation; local/category fallback only.
- `IMAGE_PROVIDER=legacy-gemini`: deprecated Gemini path.

`OPENAI_API_KEY` is required for remote image generation. Without it, or when `PIPELINE_OFFLINE=1`, image2 writes category fallback metadata instead of publishing broken images.

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

Every public card should have either generated art or a category fallback. The fallback assets live under `public/generated/fallbacks/`, while generated article images live under `public/generated/articles/`.

The editor exposes regenerate controls for article, brief, and image work. Regenerated image metadata includes provider, model, prompt, alt text, status, error, `heroImage`, `thumbnailImage`, and `ogImage`.

## Verification

Run:

```bash
npm run audit:images
npm run content:gate
```

The image audit fails on missing local assets, blank public cards, broken generated paths, and stock-derived images.
