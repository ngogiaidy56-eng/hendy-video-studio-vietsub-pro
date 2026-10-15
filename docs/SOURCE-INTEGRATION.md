# Source integration from `hendy-video-studio-new-pro-main.zip`

This repository integrates selected components from the uploaded source archive into the existing Hendy Server Video Studio Pro architecture. It deliberately avoids blindly copying every nested project and binary artifact into the active deployment.

## Integrated into the primary web stack

- Studio subtitle workflows: SRT/ASS/SSA/VTT import; SRT/VTT/ASS/TXT export; punctuation-aware smart-merge; voice-activity-based cue-boundary suggestions; local audio waveform previews rendered in a Web Worker.
- AI helpers: server-side image OCR with optional Vietnamese translation; Gemini subtitle translation; configured Whisper-compatible transcription and OpenAI-compatible TTS.
- Link helper: public metadata inspection for supported providers, without downloading third-party video or allowing the browser to supply arbitrary server-fetch URLs.
- PWA shell: installable manifest, icons, and offline navigation fallback. Authenticated API, uploaded media, signed URLs, and WebSocket traffic are not cached.
- Primary Telegram webhook with a Telegram secret-token header and a small `/start`, `/help`, admin-only `/status` command set.

## Integrated as an isolated optional profile

Selected Ktor/Kotlin Multiplatform backend, shared core, Compose UI, Android/iOS/Desktop module scaffolding, pipeline UI, Docker profile, docs, and a safe database initialization script are under `integrated-pipeline/platform-v3/`. This profile is intentionally **not** wired into the root npm/Render deployment. It needs its own Gradle/dependency build, platform-specific configuration, and deployment tests.

## Intentionally not copied from the archive

- Legacy Telegram bot files containing a hard-coded bot token. The copied implementation reads credentials only from environment variables and validates the configured webhook secret.
- Arbitrary-URL Scrapy extraction agents and unrestricted URL fetch logic, because they can introduce server-side request forgery (SSRF) and unbounded crawling risks.
- A large nested CapCut source archive and modules with credential literals or unclear external licensing/provenance.

The uploaded archive contained a hard-coded Telegram token. Treat that credential as exposed: revoke/rotate it with BotFather and update deployment secrets before using or publishing a repository. This document intentionally does not reproduce the token.

## Remaining product work

This import is not proof that every feature described by the source archive is production-ready. The billing/payment layer, full downloader or rights-aware source-provider integration, AI image/video generation, complete Telegram product bot, MongoDB runtime repository, native app signing/store releases, full provider integration tests, and complete Gradle build validation remain separate work items. See `PRODUCTION-READINESS.md` before public release.
