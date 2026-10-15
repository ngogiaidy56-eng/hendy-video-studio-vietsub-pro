# Cloudflare Workers & Pages via GitHub

This repository uses **GitHub Actions + Wrangler Direct Upload** by default. Worker deployment and Pages deployment are separate workflows so static UI deploys do not accidentally restart or replace the API origin.

- Worker workflow: `.github/workflows/deploy-cloudflare.yml`
- Pages workflow: `.github/workflows/deploy-cloudflare-pages.yml`
- Worker config: `workers/cloudflare-edge/wrangler.jsonc`
- Pages project bootstrap: `scripts/ensure-cloudflare-pages-project.mjs`

## 1. Create a Cloudflare API token

In Cloudflare Dashboard, open **My Profile → API Tokens → Create Token → Custom Token**. Grant only the account permissions needed by this repository:

- **Workers Scripts: Edit** (create/update the Edge Worker)
- **Cloudflare Pages: Edit** / **Pages Write** (create/deploy the two Pages projects)

Limit the token to the intended Cloudflare account. Do not use the Global API Key. Store the token only as a GitHub Secret.

## 2. Configure GitHub repository Secrets

In GitHub, open this repository → **Settings → Secrets and variables → Actions → Secrets** and add:

- `CLOUDFLARE_API_TOKEN` — the custom API token above.
- `CLOUDFLARE_ACCOUNT_ID` — the Account ID shown in the Cloudflare dashboard URL (`/accounts/<ACCOUNT_ID>/...`). It is an identifier, not the API token.

## 3. Configure GitHub repository Variables

Under **Settings → Secrets and variables → Actions → Variables**, add:

- `API_ORIGIN` — the root HTTPS URL of the Express API origin (for example, the Render service URL). Do not add `/api/v1`, credentials, query, or fragment. Cloudflare Edge proxies paths to this origin; FFmpeg, the queue, PostgreSQL and the Render worker remain on the backend platform.
- `CLOUDFLARE_ALLOWED_ORIGINS` — comma-separated exact HTTPS origins allowed by Edge CORS, with no trailing slash. For the default Pages project names, use `https://hendy-server-video-studio-pro.pages.dev,https://hendy-server-video-studio-admin.pages.dev`; add custom domain origins if you configure them.
- `VITE_API_BASE_URL` — the public root HTTPS URL of the deployed Edge Worker/custom API domain. Example: `https://api.example.com`. The browser must call the Edge URL, not `API_ORIGIN`, when Edge is intended to be the public gateway.

The `VITE_API_BASE_URL` must be set after the first Worker deployment if you plan to use the generated `workers.dev` URL (the account's `workers.dev` subdomain is account-specific). Run the Pages workflow again after setting or changing this variable, because Vite embeds it at build time.

## 4. Deploy sequence

1. Push this repository to GitHub on the `main` branch.
2. Set `API_ORIGIN` and `CLOUDFLARE_ALLOWED_ORIGINS` first.
3. Open **GitHub → Actions → Deploy Cloudflare Edge Worker → Run workflow**. This publishes `hendy-video-studio-edge` and injects `ORIGIN_API` / `ALLOWED_ORIGINS` as Wrangler variables.
4. Open Cloudflare Dashboard → **Workers & Pages → hendy-video-studio-edge**. Copy its `workers.dev` URL, or attach a custom domain.
5. Set GitHub variable `VITE_API_BASE_URL` to that public Worker/custom-domain URL.
6. Open **GitHub → Actions → Build and Deploy Cloudflare Pages → Run workflow**. It builds/tests both React apps, ensures the Pages projects exist, then deploys both static sites.
7. Configure the API server's `CORS_ORIGINS` to include the exact Studio/Admin website origins, and verify `/health`, login, asset upload and one render job in staging.

After configuration, changes pushed to `main` trigger the respective workflow when paths listed under its trigger are changed. You can also run either workflow manually with `workflow_dispatch`.

## 5. GitHub integration modes: do not use two deployers for one Pages project

The Pages workflow checks how each Pages project was created:

- **Direct Upload project** (created by this workflow if missing): GitHub Actions builds it and uploads `apps/studio-web/dist` or `apps/admin-web/dist` with Wrangler.
- **Git-integrated project** (source type GitHub/GitLab): the workflow deliberately skips Wrangler upload. Cloudflare Workers Builds is the deployer for that project. Configure its root directory as `/`, build command as `npm install && npm run build --workspace @hendy/studio-web` (or `@hendy/admin-web`), output directory as `apps/studio-web/dist` (or `apps/admin-web/dist`), and add `VITE_API_BASE_URL` / `VITE_REQUIRE_AUTH=true` in that Pages project's build environment.

A Pages project created for Direct Upload cannot later be converted to Git integration. If you specifically want Cloudflare's native Git integration rather than GitHub Actions uploads, create a **new** Git-connected Pages project and use its configured project name / build settings. Do not configure two independent deploy pipelines to publish the same Pages project.

For a Git-connected Worker, Cloudflare Dashboard → **Workers & Pages → select Worker → Settings → Builds → Connect** can be used. In that mode, disable the Worker GitHub Actions deploy workflow for that same Worker, or keep Actions as the only deployer. Do not let both systems publish the same Worker concurrently.

## 6. Useful checks

```bash
npm install
npm run validate:extras
npm run typecheck --workspace @hendy/cloudflare-edge
npm run typecheck --workspace @hendy/studio-web
npm run typecheck --workspace @hendy/admin-web
npm test --workspace @hendy/studio-web
npm run build --workspace @hendy/studio-web
npm run build --workspace @hendy/admin-web
```

The Cloudflare Worker is an edge gateway, not the long-running FFmpeg service. Keep CPU-heavy render jobs, PostgreSQL and BullMQ on the backend service. Configure secrets such as `GEMINI_API_KEY`, database credentials and session secrets on the backend/Cloudflare secret manager as appropriate; never place secret values in GitHub Variables, Wrangler `vars`, or frontend `VITE_*` variables.
