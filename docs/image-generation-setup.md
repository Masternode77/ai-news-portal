# Image Generation Setup

The provider is `IMAGE_PROVIDER=codex`. Article artwork is generated and visually reviewed in the current Codex session, then registered as repository-owned files. GitHub Actions and Vercel do not call a remote image API.

## Provider Selection

- `IMAGE_PROVIDER=codex`: registered Codex artwork with deterministic local fallback variants.
- `IMAGE_PROVIDER=image2`: compatibility alias for the same local provider.
- `IMAGE_PROVIDER=local`: deterministic local fallback variants only.

Remote API and OAuth image providers are disabled. No image credential is required or documented for the article pipeline.

## Register Codex artwork

Generate the image with the native Codex image tool, inspect the result, and register the returned local file:

```sh
node scripts/import-codex-image.mjs --id <article-id> --file <generated-image-path>
```

Pass `--model` only when the generation tool reports an exact model. Commit the changed article, `config/codex-image-manifest.json`, and generated artwork together. Registration validates image type, dimensions, byte and pixel bounds, then writes hero, thumbnail and OpenGraph variants under `public/generated/articles/{slug}/`.

## Fallback Behavior

Local fallback variants are article-local WebP files under `public/generated/articles/`. Reader-side category fallback SVGs live under `public/generated/fallbacks/` and are selected only when the article image surface has no trusted variant.

The generic editor does not expose article, brief, or image-regeneration controls. It can save existing article metadata and use an operator-supplied replacement image path; generation or reprocessing remains outside that editor and must pass the normal rights and publication gates. The manifest binds registered artwork to the article prompt fingerprint and source-file SHA-256 so an article revision cannot silently reuse mismatched artwork.

## Verification

Run:

```bash
npm run audit:images
npm run content:gate
```

The image audit fails on missing local assets, blank public cards, broken generated paths, and stock-derived images.

See `docs/codex-image-workflow.md` for the canonical operating contract.
