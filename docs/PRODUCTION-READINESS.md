# Production readiness and deployment runbook

This is a **production candidate**, not a claim of certified production readiness. The repository contains working web/API/render paths and operational controls, but it still needs environment-specific security review, dependency installation/build in CI, backup/restore drills and load testing before public launch.

## Services and data flow

- `apps/admin-web`: separate Vite/React administrative control plane. Requires an active account with the `admin` role; backend routes repeat authorization checks.
- `apps/studio-web`: Vite/React editor workspace. Login uses a short-lived signed server session stored in `sessionStorage`.
- `services/api-gateway`: Express API, PostgreSQL persistence, invite/login, role-aware project and asset access, audit events, render queue and signed media URLs.
- `services/ai-worker`: BullMQ worker that resolves media files under `UPLOAD_DIR`, probes them with FFprobe and renders a multi-track FFmpeg composition.
- `packages/storage`: optional Cloudflare R2/S3-compatible object storage. Uploads and completed MP4 outputs are copied to R2 when fully configured; media requests can restore missing local objects from R2.
- `database/postgres-rbac`: ordered SQL migrations. The current API persists project timelines as PostgreSQL JSONB. `database/mongo-projects/project.schema.json` documents a future document-store schema; the MongoDB repository is not yet wired into the API.
- `workers/cloudflare-edge`: separate Worker deployment scaffold. The UI reports deployment as unverified until an external deployment check is implemented.

## Local development

1. Install Node.js 22+, npm, FFmpeg and FFprobe (Docker includes FFmpeg).
2. Copy `.env.example` to `.env`. For local Docker, set `POSTGRES_PASSWORD`, and make the password in `DATABASE_URL` match it. Use URL-safe random hex credentials to avoid URL escaping mistakes.
3. Generate independent API secrets. For example, in PowerShell: `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"` (run four times for `API_ACCESS_TOKEN`, `ADMIN_API_TOKEN`, `SESSION_SECRET`, and `MEDIA_SIGNING_SECRET`). Never reuse a password/token for multiple settings.
4. Run `npm install`, then `docker compose up --build`. The compose profile exposes the API only on `127.0.0.1:8787`; PostgreSQL and MongoDB ports are for local development only and should not be exposed publicly.
5. Bootstrap an admin after the migration completes:

   ```bash
   BOOTSTRAP_ADMIN_EMAIL=admin@example.com BOOTSTRAP_ADMIN_PASSWORD='choose-a-long-unique-password' npm run bootstrap:admin
   ```

   On PowerShell, set the two variables with `$env:BOOTSTRAP_ADMIN_EMAIL='admin@example.com'` and `$env:BOOTSTRAP_ADMIN_PASSWORD='...'` before running the command.

6. For standalone frontends, run `npm run dev:admin` and `npm run dev:studio` in separate terminals. Set `VITE_API_BASE_URL` if the API is not on the Vite origin. For a production-like flow set `VITE_REQUIRE_AUTH=true`.

## Required production configuration

Configure these through the deployment platform's secret manager, never commit their values:

- `DATABASE_URL`, `REDIS_URL`, `API_ACCESS_TOKEN`, `ADMIN_API_TOKEN`, `SESSION_SECRET`, `MEDIA_SIGNING_SECRET`.
- `PUBLIC_APP_URL`, `INVITE_BASE_URL`, `CORS_ORIGINS` with **exact HTTPS origins** for Admin and Studio, without a trailing slash.
- `UPLOAD_DIR`, `OUTPUT_DIR`, `MAX_UPLOAD_MB`, `MAX_TRANSCRIPTION_MB`, `RENDER_TIMEOUT_MS`, and `TRUST_PROXY=true` only behind a trusted proxy that correctly overwrites forwarded headers.
- For durable object copies: `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, and either `R2_ENDPOINT` or `CLOUDFLARE_ACCOUNT_ID`; `R2_REGION=auto`. A partial R2 configuration intentionally prevents production startup.
- For invitation emails: `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_FROM`, and optionally `SMTP_USER`/`SMTP_PASSWORD`. If SMTP is absent, the Admin API returns an invitation URL for a trusted administrator to deliver manually.
- For AI: `GEMINI_API_KEY` for contextual subtitle translation; `WHISPER_API_URL` plus optional `WHISPER_API_TOKEN` for an OpenAI-compatible transcription endpoint; `TTS_API_URL`, optional `TTS_API_TOKEN`, and `TTS_MODEL` for an OpenAI-compatible speech endpoint. Keep outbound endpoints operator-configured; never accept provider URLs from browser requests. Provider compatibility and output MIME types must be verified against the actual provider before launch.
- For frontend static services: `VITE_API_BASE_URL` should point at the API's HTTPS origin, and `VITE_REQUIRE_AUTH=true`.

## Render deployment

The Blueprint describes a single Docker web service running the API and render worker together, plus Redis, PostgreSQL and independent static Admin/Studio sites. This is a deliberately simple single-instance topology because FFmpeg workers require shared file access. Do not scale the API/worker service horizontally with local media storage. For horizontal scaling, first move all input/output handoff to shared object storage, run a distinct background worker service and verify Render's persistent-disk constraints; then split API and worker deployments.

Set `CORS_ORIGINS` to the actual Admin and Studio origins, `PUBLIC_APP_URL` and `INVITE_BASE_URL` to the correct sites, and `VITE_API_BASE_URL` on both static sites. The API and worker must have matching `DATABASE_URL`, `REDIS_URL`, `UPLOAD_DIR`, `OUTPUT_DIR`, and R2 settings. The web service needs a persistent disk if R2 is not configured. Check `/health`, log output, and one small real render after every deployment.

## Test and release gates

```bash
npm run validate:architecture
npm run typecheck
npm test
npm run build
npm run test:render:e2e  # requires local ffmpeg/ffprobe; generates synthetic media
```

The GitHub `release-master.yml` workflow runs typecheck, unit tests and the web build. Before release, also verify migrations on a restored database copy, login/invitation, authorization boundaries, R2 upload/read-after-restore, a real transcription and AI translation provider, one MP4 render, job retry behavior, disk capacity, backups, and TLS/CORS from deployed origins.

## Known boundaries that must not be represented as implemented

- Billing/payments, subscription entitlement and metering are not wired to a payment provider.
- Telegram webhook signature validation and full Telegram Bot/Mini App workflow are not connected to this API.
- TTS API routing is implemented for an OpenAI-compatible speech endpoint, but it is not provider-agnostic. Configure and test a compatible provider, credentials, voice/model availability, cost limits and generated audio quality before public use.
- MongoDB project persistence is schema-only; active projects are in PostgreSQL JSONB.
- Native Kotlin Multiplatform, iOS/Xcode archive, store signing, store upload and release approval require platform-specific projects and credentials; current native directories are scaffolds.
- Cloudflare Worker deployment and R2 account permissions cannot be verified without your Cloudflare secrets and account.
- Production assurance requires installing the lockfile-resolved dependency graph in CI, dependency/security scanning, load tests, backup/restore proof and review by the operator before going public.
