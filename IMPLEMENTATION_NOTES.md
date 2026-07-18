# Implementation notes

## What was changed

1. **Homepage redesign**
   - Kept the same hero + masonry board format
   - Rebuilt the visual system into a premium glass / monochrome dashboard
   - Added stat cards, category badges, source + region pills, stronger card hierarchy

2. **Pipeline stability fix**
   - The original repo stored only curated IDs for the day.
   - On later 8-hour runs, those IDs could disappear from fresh RSS pulls and lead to empty publish slots.
   - The updated pipeline stores `curatedItems` directly inside the day plan state so the 2nd and 3rd runs still publish the same daily selections reliably.

3. **Optional OpenRouter intelligence**
   - Added `scripts/lib/openrouter.mjs`
   - Optional daily curation with `openai/gpt-5.3-codex`
   - Optional article summary / expert insight / tags / category / image prompt generation

4. **Source-first Image2 provider flow**
   - Added a provider layer under `scripts/lib/image-providers/`
   - Defaults to `IMAGE_PROVIDER=image2`; publisher artwork is attempted first unless `forceAiImage` is set
   - Keeps `IMAGE_PROVIDER=chatgpt` and `IMAGE_PROVIDER=openai-api` as legacy adapters
   - Moves Gemini / Nano Banana behind `IMAGE_PROVIDER=legacy-gemini`
   - Validates and stores source artwork locally instead of hotlinking it
   - Preserves a bounded local raster fallback when source and provider paths fail

5. **KST scheduling**
   - GitHub Actions now runs at 00:05 / 08:05 / 16:05 KST using UTC cron entries

6. **Telegram preview hook**
   - Added homepage capture script with Playwright
   - Added Telegram `sendPhoto` script
   - Requires `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID`

## What still requires your live credentials / environment

- GitHub push from this environment
- Vercel import/deploy from your account
- Telegram photo send from your bot token
- Live OpenAI Image2 API execution
- Live OpenRouter API execution

## Suggested first live test

```bash
npm install
npm run pipeline
npm run build
npm run dev
```

Then set GitHub Secrets:

- `OPENROUTER_API_KEY`
- `OPENROUTER_MODEL` (optional)
- `OPENAI_API_KEY` when API-backed Image2 generation is required
- `IMAGE_PROVIDER=chatgpt`, `CHATGPT_IMAGE_OAUTH_ENDPOINT`, and `CHATGPT_IMAGE_OAUTH_ACCESS_TOKEN` only for the legacy OAuth adapter
- `IMAGE_PROVIDER=legacy-gemini`, `GEMINI_API_KEY`, and `GEMINI_IMAGE_MODEL` only for deprecated Gemini fallback testing
- `TELEGRAM_BOT_TOKEN` (optional)
- `TELEGRAM_CHAT_ID` (optional)

The scheduled workflow sets `IMAGE_PROVIDER: image2` as ordinary workflow configuration, not a secret.
