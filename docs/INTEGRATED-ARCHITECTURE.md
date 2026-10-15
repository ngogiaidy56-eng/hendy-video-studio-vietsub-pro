# Integrated architecture: hendy-video-studio-vietsub-new-pro

This branch combines the existing API/render starter with the requested 7-tier monorepo layout.

## User / admin separation
- **Admin Control Plane:** `apps/admin-web/`, separately published by Render. Treat admin APIs as private until authentication and RBAC middleware are fully wired.
- **Studio Client:** `apps/studio-web/`, separately published by Render or Cloudflare Pages. The workspace now uses shared `StudioWorkspace`, `VideoPlayer`, and `SubtitleList` components. `StudioHomePage` is an optional landing page module.
- **Shared libraries:** `packages/core-utils`, `packages/shared-types`, `packages/ui-components`, `packages/database`, and `packages/logger`.

## Services
- **Tier 3 Edge:** `workers/cloudflare-edge/` is the edge proxy/WAF starter; configure origin allow-listing, rate limits, and Cloudflare secrets before production.
- **Tier 4 API:** `services/api-gateway/` exposes project, asset, render-manifest, health and job interfaces.
- **Tier 5 AI/render:** `services/ai-worker/` uses BullMQ/Redis and FFmpeg. The current render path is a starter, not yet a full multi-track compositor.
- **Tier 6 persistence:** PostgreSQL RBAC/audit/render schema plus a MongoDB project document schema. Runtime repositories and migrations must be wired before relying on durable application state.
- **Native pipeline:** `integrated-pipeline/` contains Kotlin Multiplatform/Compose, Android Media3 launcher, desktop launcher, iOS AVKit adapter and Fastlane scaffold. iOS builds need a real Xcode project plus signing secrets; this is deliberately not represented as an already-buildable IPA.

## Delivery
- `.github/workflows/release-master.yml`: build/typecheck/test and release archive.
- `.github/workflows/deploy-cloudflare.yml`: edge worker deployment.
- `.github/workflows/deploy-cloudflare-pages.yml`: Studio web deployment.
- `.github/workflows/mobile-native-build.yml`: Android APK/AAB build; iOS job is conditional on an Xcode project.
- `render.yaml`: API + Redis + PostgreSQL + independent Admin and Studio static sites.

## Production gates
1. Add OIDC/Telegram Mini App authentication, authorization checks and audit enforcement to admin endpoints.
2. Persist projects/jobs to Postgres/MongoDB and test retry/idempotency behaviour.
3. Complete signed R2 uploads, retention rules, safe FFmpeg invocation and multi-track/ASS rendering.
4. Add real Android project signing and iOS Xcode project/signing; supply GitHub Actions secrets through repository settings.
5. Set `VITE_API_BASE_URL`, `CORS_ORIGINS`, `ADMIN_API_TOKEN`, DB and Cloudflare variables for the deployed environment. Do not commit real secret values.
