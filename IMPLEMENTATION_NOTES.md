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

4. **ChatGPT/OpenAI-first image provider flow**
   - Added a provider layer under `scripts/lib/image-providers/`
   - Defaults to `IMAGE_PROVIDER=chatgpt` for an OAuth-backed ChatGPT/OpenAI runtime adapter
   - Keeps `IMAGE_PROVIDER=openai-api` as an explicit API-key fallback path, not the default
   - Moves Gemini / Nano Banana behind `IMAGE_PROVIDER=legacy-gemini`
   - Avoids publishing external source images as the main card art
   - Preserves the fallback chain: configured provider, local source-image poster, SVG placeholder

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
- Live ChatGPT/OpenAI image runtime or explicit OpenAI API-key fallback execution
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
- `IMAGE_PROVIDER=chatgpt`
- `CHATGPT_IMAGE_OAUTH_ENDPOINT`
- `CHATGPT_IMAGE_OAUTH_ACCESS_TOKEN`
- `IMAGE_PROVIDER=openai-api` and `OPENAI_API_KEY` only if API-key auth / billing is acceptable
- `IMAGE_PROVIDER=legacy-gemini`, `GEMINI_API_KEY`, and `GEMINI_IMAGE_MODEL` only for deprecated Gemini fallback testing
- `TELEGRAM_BOT_TOKEN` (optional)
- `TELEGRAM_CHAT_ID` (optional)
