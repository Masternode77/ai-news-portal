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

4. **Nano Banana image flow**
   - Switched the default Gemini image model to `gemini-2.5-flash-image`
   - Added cleaner editorial prompt generation and stronger SVG fallback art
   - Avoids publishing external source images as the main card art

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
- Live Gemini / OpenRouter API execution

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
- `GEMINI_API_KEY`
- `GEMINI_IMAGE_MODEL` (optional)
- `TELEGRAM_BOT_TOKEN` (optional)
- `TELEGRAM_CHAT_ID` (optional)
