import fs from 'node:fs/promises';

async function main() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  const screenshotPath = 'artifacts/homepage.png';

  if (!token || !chatId) {
    console.log('[telegram] TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID missing; skipping');
    return;
  }

  const photo = await fs.readFile(screenshotPath);
  const form = new FormData();
  form.set('chat_id', chatId);
  form.set('caption', 'Latest AI / Data Center Signal Board homepage preview');
  form.set('photo', new Blob([photo], { type: 'image/png' }), 'homepage.png');

  const response = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
    method: 'POST',
    body: form,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Telegram sendPhoto failed: ${response.status} ${text}`);
  }

  console.log('[telegram] screenshot sent successfully');
}

main().catch((error) => {
  console.error('[telegram] fatal error:', error);
  process.exitCode = 1;
});
