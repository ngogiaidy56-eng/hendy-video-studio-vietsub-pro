# Security Notes

- Never commit local `.env` files, API keys, Telegram bot tokens, database passwords or signing materials.
- Telegram Mini App `initData` must be HMAC-validated server-side and rejected when stale.
- Configure `CORS_ALLOWED_ORIGINS` explicitly for deployed domains.
- Use a randomly generated `EDGE_SHARED_SECRET` with at least 32 bytes in production.
- Rotate any Telegram bot token or credential that has ever been committed or included in an uploaded source archive.
- Keep PostgreSQL and Redis private; the included Compose profile only binds those ports to loopback.
- Review and pin Gradle/plugin/dependency versions and add a Gradle wrapper before CI release.
- The legacy Cloudflare bot file with a literal token was intentionally not copied.
