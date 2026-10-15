# Vietsub Platform V3 — optional Ktor / Kotlin Multiplatform modules

This folder preserves the separate Ktor + Kotlin Multiplatform implementation supplied with the project. It is intentionally isolated from the main Node/React npm workspaces so the default Render deployment remains the Express API Gateway + React Admin/Studio + BullMQ worker architecture.

## Modules

- `server/`: Ktor service; Telegram Mini App initData validation, admin commands, feature flags, websocket events, Gemini OCR/translation, Whisper transcription, FFmpeg hardsub and maintenance controls.
- `core/`: shared Kotlin domain/networking/SRT utilities.
- `composeApp/`: shared Compose screens and navigation.
- `androidApp/`: Android launcher and Media3 adapter.
- `iosApp/`: Swift/AVPlayer adapter sources. An Xcode project and signing setup are not included.
- `desktopApp/`: JVM desktop launcher / VLCj adapter seam.
- `webApp/`: Telegram Mini App / Compose Web scaffold and Pages Functions.
- `pipeline-ui/`: pipeline console scaffold.

## Security notes

All previously embedded Telegram tokens, user IDs, demo passwords and edge secrets have been removed from this copy. Use `.env.example` as a template and supply secrets with a local untracked `.env` or the deployment secret manager. Never commit `.env`. In `APP_ENV=production`, the Ktor service requires a non-empty database password and an `EDGE_SHARED_SECRET` of at least 32 bytes. The bot is disabled when `TELEGRAM_BOT_TOKEN` is blank. Database/cache ports in Compose are bound to loopback only.

The legacy Cloudflare bot source that contained an embedded token and the unrestricted Scrapy pipeline agent were deliberately excluded. The primary project contains its own Cloudflare edge worker and a constrained public-video metadata inspector. Do not expose a generic URL crawler/downloader to untrusted users.

## Build

A Gradle wrapper is not included. Use a compatible installed Gradle and JDK 21. First validate dependency and plugin versions against your configured repositories, then run:

```bash
gradle :server:installDist --no-daemon
gradle :androidApp:assembleDebug --no-daemon
```

The Ktor/KMP module is an optional alternate platform target and has not been built in this environment. It must not be considered release-ready until its dependencies resolve and automated tests and signing/deployment checks pass. It does not replace the default Node/React API without an explicit routing migration.
