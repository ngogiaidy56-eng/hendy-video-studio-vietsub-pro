# Architecture map

## Telegram Platform Endpoint

### Telegram Bot UI
- `TelegramBotService.kt`
- `/start`, `/status`, `/admin`
- Inline keypad for maintenance and feature flags
- Video/document reception downloads the Telegram file into `WORK_DIR`

### Telegram Mini App
- `webApp/src/jsMain/kotlin/.../Main.kt`
- `webApp/src/jsMain/resources/index.html`
- Loads `telegram-web-app.js`, posts `Telegram.WebApp.initData` to Ktor, receives a session token, then starts Compose UI.
- Intended deployment: Cloudflare Pages.

## Ktor Backend

### Application.kt
- Netty engine
- JSON ContentNegotiation
- CORS
- StatusPages
- WebSockets
- Routes
- Startup webhook registration

### Security
- `TelegramAuthValidatorJvm.kt`: HMAC-SHA-256 validation of `initData.hash` plus `auth_date` freshness.
- `TelegramAdminService.kt`: Telegram ID allow-list.
- `TelegramSessionService.kt`: short-lived application session tokens.
- `MaintenanceInterceptor.kt`: blocks normal API operations during maintenance while leaving health/status/admin/auth paths available.

### AI / Media pipeline
- `WhisperService.kt`: OpenAI `/v1/audio/transcriptions` multipart call.
- `AiService.kt`: Gemini `generateContent` REST call for contextual translation.
- `FFmpegService.kt`: `ffmpeg -vf subtitles=...` hardsub renderer.

### Realtime
- `EventStreamService.kt` broadcasts JSON `WsEvent` events to authenticated WebSocket clients.

## KMP Core

- `Models.kt`: shared serializable API/domain models.
- `Repositories.kt`: repository contracts.
- `InMemoryRepositories.kt`: starter implementations.
- `ApiClient.kt`: shared Ktor client for auth/status/translate/transcribe/render/admin.
- `AdminApiClient.kt`: admin convenience facade.
- `SrtFormatter.kt`: timestamp formatting and SRT serialization.
- `TelegramAuthValidator.kt`: shared auth contract; JVM implementation lives in server because the server owns the bot secret.

## Compose UI

- `App.kt`: Koin Compose bootstrap and Material 3 UI.
- `AppNavigation.kt`: Player / Timeline / Admin routes.
- `Screens.kt`: shared screens.
- `ViewModels.kt`: screen state and editor operations.
- `PlatformPlayerController.kt`: native player seam.

## Platform adapters

- Android: `Media3PlayerAdapter.kt` using AndroidX Media3 ExoPlayer.
- iOS: `AVPlayerAdapter.swift` using AVFoundation.
- Desktop: `VlcjPlayerAdapter.kt` seam; wire a VLCj component in desktop production UI.
- Web/TMA: browser video element / Compose Web integration can be added behind the same editor model.

## Sandbox & Auto-Link Translation Pipeline

```text
React Pipeline UI / Telegram TMA
        │
        ├── same-origin /api/* ──> Pages Functions ──Service Binding──> Edge Worker
        │                                                      │
        │                                                      └──> Ktor :8080
        │                                                            ├─ SOT Auto-Patch
        │                                                            ├─ Strict Dry-Run Gate
        │                                                            ├─ Recovery Backup
        │                                                            ├─ Gemini OCR / Translation
        │                                                            ├─ Whisper Transcription
        │                                                            └─ FFmpeg Hardsub
        │
        └── dev only ws://127.0.0.1:8799 ──> Local Pipeline Agent
                                               └─ extractor.ts -> Scrapy Python spider
```

### Release contract

`BLOCKED` means no release should be published. `NOMINAL` + `RELEASE_UNLOCKED` is the only release-safe verdict emitted by the pipeline orchestrator.

### Telegram access

- `/start` is routed to the legacy Hendy bot menu.
- `/token` issues a six-character one-time token with 60-second TTL in `BOT_STATE` KV.
- Pages `/api/auth/otp` consumes the token and forwards a short-lived HMAC-authenticated identity assertion to Ktor.
- Ktor creates the normal application session, so admin privileges remain centralized in `TelegramAdminService`.
