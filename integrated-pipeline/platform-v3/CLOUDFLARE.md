# Cloudflare Workers + Pages deployment map

```text
                         Telegram
                            │
                     HTTPS / WebApp
                            ▼
                 ┌───────────────────┐
                 │ Cloudflare Pages  │
                 │ video-subtitle-tma│
                 └─────────┬─────────┘
                           │
                 Pages Functions
                  /api/* /telegram/*
                           │ Service Binding
                           ▼
                 ┌───────────────────┐
                 │ Cloudflare Worker │
                 │ video-subtitle-api│
                 └─────────┬─────────┘
                           │ BACKEND_ORIGIN secret
                           ▼
                 ┌───────────────────┐
                 │ Ktor :server      │
                 │ Netty + FFmpeg    │
                 └───────────────────┘
```

## Why this split

Pages is responsible for CDN/static delivery of the TMA. Pages Functions provide same-origin server-side routes and can call a Worker through a Service Binding. The Worker is the edge gateway and keeps the Ktor origin out of browser code. Ktor remains the execution environment for JVM-only workloads such as FFmpeg and server-side API clients. Cloudflare documents Pages Functions service bindings and Workers static assets/edge deployments separately.

## Required Cloudflare resources

1. Pages project: `video-subtitle-tma`
2. Worker: `video-subtitle-api`
3. Worker secret: `BACKEND_ORIGIN`
4. Optional Worker custom domain: `api.example.com`
5. Pages custom domain / Telegram Mini App URL

## Source-of-truth config

- Pages: `webApp/wrangler.jsonc`
- Worker: `cloudflare/worker/wrangler.jsonc`
- Pages proxy functions: `webApp/functions/`

Wrangler JSON/JSONC is the recommended new-project configuration format, and Cloudflare notes that Wrangler configuration becomes the source of truth when used for deployment.
