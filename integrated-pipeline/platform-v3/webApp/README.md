# Telegram Mini App — Cloudflare Pages

The TMA is deployed as a Cloudflare Pages project. The Pages project exposes same-origin proxy routes through Pages Functions, so the browser does not need a hard-coded Ktor URL.

## Architecture

```text
Telegram Mini App
       │
       │ same-origin HTTPS
       ▼
Cloudflare Pages
  ├─ static Kotlin/JS bundle
  └─ Pages Functions
       ├─ /api/*
       └─ /telegram/webhook
              │ Service Binding
              ▼
      video-subtitle-api Worker
              │ HTTPS proxy
              ▼
          Ktor :server
```

Cloudflare Pages supports Pages Functions and service bindings to Workers.

## Build

From repository root:

```bash
gradle :webApp:jsBrowserDistribution
```

Output:

```text
webApp/build/dist/js/productionExecutable/
```

## Local Pages + Worker

Start the Worker in one terminal:

```bash
cd cloudflare/worker
npm install
npm run dev
```

Start Pages in another terminal. The Pages Function service binding can be connected to the local Worker by Wrangler:

```bash
cd webApp
npm install
npx wrangler@4.148.0 pages dev build/dist/js/productionExecutable --service API_WORKER=video-subtitle-api
```

For a single local session, Wrangler also supports starting the Pages project with multiple configs, with the Pages config first and the Worker config afterwards.

## Production deploy

The Pages Wrangler file is `wrangler.jsonc` and uses `pages_build_output_dir`. Cloudflare recommends `wrangler.jsonc` for new projects, and Pages treats this config as the source of truth when used for deployment.

Deploy after the Worker exists:

```bash
cd webApp
npm install
npx wrangler@4.148.0 pages deploy --project-name video-subtitle-tma
```

For CI, the repository workflow deploys the Worker first, then Pages.
