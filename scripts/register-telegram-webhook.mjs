const token = process.env.TELEGRAM_BOT_TOKEN ?? '';
const secret = process.env.TELEGRAM_WEBHOOK_SECRET ?? '';
const webhookUrl = process.env.TELEGRAM_WEBHOOK_URL ?? '';
if (!token) throw new Error('Set TELEGRAM_BOT_TOKEN in the environment.');
if (Buffer.byteLength(secret, 'utf8') < 32 || !/^[A-Za-z0-9_-]+$/.test(secret)) throw new Error('TELEGRAM_WEBHOOK_SECRET must be 32+ UTF-8 bytes and contain only A-Z, a-z, 0-9, _ or -.');
let url;
try { url = new URL(webhookUrl); } catch { throw new Error('Set TELEGRAM_WEBHOOK_URL to an HTTPS URL.'); }
if (url.protocol !== 'https:' || !url.pathname.endsWith('/api/v1/telegram/webhook')) throw new Error('Webhook URL must be HTTPS and end with /api/v1/telegram/webhook.');
const response = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ url: url.toString(), secret_token: secret, drop_pending_updates: false }),
  signal: AbortSignal.timeout(10000),
});
const payload = await response.json().catch(() => ({}));
if (!response.ok || payload.ok !== true) {
  console.error('Telegram rejected webhook registration. Check the bot token and webhook URL.');
  process.exit(1);
}
console.log('Telegram webhook registered. Telegram will send the secret-token header; the token itself was not printed.');
