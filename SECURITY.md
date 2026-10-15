# Security policy

Do not commit `.env`, API keys, Telegram bot tokens, database URLs, access tokens, signed URLs, or private build artifacts. Report vulnerabilities privately to the repository maintainer rather than opening a public issue containing exploit details.

Before public deployment, configure authentication, authorization, rate limiting, request-size limits, secret rotation, dependency scanning, storage access control, backups, and audit retention. The starter admin page is not a substitute for authentication.

## Imported source credential notice

The uploaded legacy source archive contained a Telegram bot token literal. That literal was not copied to this repository. Treat the original credential as exposed: revoke/rotate it in BotFather and update the production secret manager before redeploying the bot. Never commit `.env` files or paste real API keys into source code/issues.
