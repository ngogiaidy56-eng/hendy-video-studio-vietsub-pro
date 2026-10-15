# Hendy Server Video Studio Pro

Monorepo production-candidate for a Vietnamese video-subtitle editor, split into separate Admin and Studio Web apps with an Express API, signed sessions, PostgreSQL, Redis/BullMQ, a multi-track FFmpeg render worker, optional Cloudflare R2 storage, and CI/CD scaffolding.

> **Important:** source code and automated checks are provided here, but “production-complete” must be earned by deploying against real credentials, running integration/security/load tests and validating backup/restore. This repository does not claim payment processing, live Telegram Bot workflows, MongoDB runtime persistence, native app signing, or a verified Cloudflare account deployment are finished. See [Production readiness](docs/PRODUCTION-READINESS.md).

## Architecture

```text
apps/admin-web (React 19) ───────────────┐  Admin Control Plane
                                          ├── services/api-gateway (Express)
apps/studio-web (React 19) ───────────────┘            │
                                                       ├── PostgreSQL (users, RBAC, projects, assets, jobs, audit)
                                                       ├── Redis/BullMQ ── services/ai-worker ── FFmpeg/FFprobe
                                                       ├── local shared disk (working set)
                                                       └── optional Cloudflare R2/S3-compatible object copies

workers/cloudflare-edge              Edge Worker scaffold / separate deployment
integrated-pipeline/                  Kotlin Multiplatform / native app scaffolds
packages/shared-types                 Shared project and render manifest types
packages/storage                     R2/S3-compatible object storage adapter
```

## Requirements

- Node.js 22+ and npm.
- FFmpeg/FFprobe for local server-side rendering. The Docker image installs them.
- PostgreSQL and Redis for persistent production rendering/auth. Docker Compose provides local services.

## Local startup

1. Copy `.env.example` to `.env`. Set `POSTGRES_PASSWORD` to a strong URL-safe value and make it match the password in `DATABASE_URL`.
2. Generate separate 32+ byte random secrets for `API_ACCESS_TOKEN`, `ADMIN_API_TOKEN`, `SESSION_SECRET`, and `MEDIA_SIGNING_SECRET`. Never reuse tokens or commit them.
3. Install dependencies and start backing services:

   ```bash
   npm install
   docker compose up --build
   ```

4. In a second terminal, bootstrap an admin after migrations finish:

   ```bash
   BOOTSTRAP_ADMIN_EMAIL=admin@example.com BOOTSTRAP_ADMIN_PASSWORD='a-long-unique-password-14-chars-minimum' npm run bootstrap:admin
   ```

5. For frontend hot reload, run `npm run dev:admin` and `npm run dev:studio` separately. Admin defaults to `http://localhost:5174`; Studio to `http://localhost:5173`; API to `http://localhost:8787`. Use `VITE_API_BASE_URL` if the API uses a different origin.

Docker Compose binds the API to localhost for development. It runs API and worker together so local disk handoff works. Do not expose development database ports publicly.

## Production features in the current source

- Session login and invite acceptance with salted scrypt password hashes, 8-hour signed sessions, status/role revalidation per API request and admin-only endpoints.
- Admin user invitation, role/status changes, audit events, persistent feature flags and safeguards preventing removal of the last active administrator.
- Owner-scoped project, asset, render-job and WebSocket access; media uploads carry SHA-256 metadata and use expiring HMAC-signed URLs.
- Redis/BullMQ render queue and a multi-track FFmpeg pipeline with main video, overlay/PiP, crop/resize transforms, keyframe position/scale/opacity expressions, fade transitions, voice + BGM mix, sidechain ducking and ASS subtitle burn-in.
- Optional Cloudflare R2 object copies for uploaded media and render output, with local restore-on-read/worker input when the file is not on the shared working disk.
- Optional Gemini subtitle translation, configured Whisper-compatible transcription endpoint, and SMTP invitation delivery.
- Health endpoint, Docker/Render configuration, database migrations, and CI workflows.

## Environment and Render

Use `.env.example` as a checklist, not as a production config. For Render, set secret values in the Render environment dashboard; configure `CORS_ORIGINS` to the exact HTTPS origins for the Admin and Studio sites and set `VITE_API_BASE_URL` on both static services to the API origin. Set `TRUST_PROXY=true` only behind Render's trusted proxy; do not trust arbitrary client-supplied forwarding headers.

`render.yaml` keeps Admin and Studio as separate static services. To avoid broken file handoff, the API and render worker run in one Docker service with a persistent disk in the default blueprint. Horizontal scale is intentionally not enabled. Split API and worker only after you have validated shared object storage, worker-side R2 downloads, capacity limits, and Render disk topology. Details: [Production readiness and deployment runbook](docs/PRODUCTION-READINESS.md).

## Checks

```bash
npm run validate:architecture
npm run typecheck
npm test
npm run build
npm run test:render:e2e
```

`npm run test:render:e2e` creates synthetic input media and runs an actual FFmpeg composition; it requires FFmpeg/FFprobe. `npm install` and full Vite/TypeScript builds still need to pass in your CI environment before deploying.

## Create the GitHub repository

After extracting the ZIP and signing in with `gh auth login`, run from the repo root:

```powershell
.\scripts\create-github-repo.ps1 -Visibility public
```

Or on Linux/macOS:

```bash
./scripts/create-github-repo.sh public
```

The script aborts if the repository already exists. Choose `private` instead of `public` for a private repository. The ChatGPT GitHub connection used for this source-generation session did not expose a create-repository action, so creating/pushing the remote remains an explicit CLI step.
