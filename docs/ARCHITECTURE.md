# Architecture map

| Layer | Path | Responsibility | State in this scaffold |
|---|---|---|---|
| Admin control plane | `apps/admin-web` | status/config view, privileged operations UI | basic UI shell; protected APIs must be wired to identity |
| Studio client | `apps/studio-web` | video preview, timeline, subtitle editor, audio levels, export manifest | runnable shell with local preview and asset/manifest endpoints |
| Shared contracts | `packages/shared-types` | project, subtitle, track, render/job types | implemented starter contracts |
| API gateway | `services/api-gateway` | health, project, asset upload, manifest/job endpoints, WebSocket updates | Express endpoints; memory fallback when Redis is absent |
| AI/render worker | `services/ai-worker` | queued FFmpeg render and job progress | sample single-clip render; AI provider integration is TODO |
| Edge | `workers/cloudflare-edge` | route to origin, signed internal requests | basic proxy skeleton; configure route/secret before deployment |
| Database | `database`, `packages/database` | PostgreSQL RBAC/audit/jobs + MongoDB timeline model | migrations and schemas are starting points; API persistence adapter is TODO |
| Native/multiplatform | `integrated-pipeline` | Ktor and Kotlin Multiplatform launchers/shared models | minimal Ktor health-service skeleton |
| DevOps | `.github/workflows`, `Dockerfile`, `render.yaml` | CI, deployment, container runtime | templates; secrets and deployment validation required |

## Render manifest contract

The client sends a schema-validated project payload to `POST /api/v1/render/manifest`. The API assigns a job ID and publishes `render-video` to BullMQ when `REDIS_URL` is configured. The worker reports progress on the queue; the API exposes `GET /api/v1/jobs/:id`. A WebSocket endpoint at `/ws/jobs/:id` sends API-side status snapshots.

## Security boundaries

- Browser clients must never receive provider keys or database credentials.
- Admin endpoints must be isolated and backed by verified identity/RBAC before public deployment.
- Uploaded filenames are generated server-side, requests are size-limited, and render input paths are constrained to the upload directory.
- A production setup should use object storage signed URLs, durable project/job repositories, rate limiting, request IDs, and audit logging.
